#!/usr/bin/env node
/**
 * AI마중 DAILY 실행 (Phase 7.1 · 7.1.3 초안)
 *
 *   npm run daily:run -- [--date YYYY-MM-DD] [--out <dir>] [--collect-only]
 *   (npm run daily:collect = --collect-only)
 *
 * DAILY_AUTOMATION_ENABLED=true 일 때만 돈다 (킬 스위치).
 * DAILY_MODE: shadow(기본, LLM 없음) · draft(명시적 수동 실행에서만 AI 초안 + 초안 QA) · publish(사용 금지).
 *   drafts/<id>.json · drafts/<id>.md  AI 초안 (편집자 검토용, 발행 승인 아님)
 * 결과는 <out>/<date>/ 에만 쓴다 (기본 ingest/daily). content/·ingest/candidates·ingest/editorial은 건드리지 않는다.
 *   run.json           실행 기록: 상태(SUCCESS·PARTIAL·FAILED), 소스별 결과, 후보 전체 판정, API 사용량
 *   candidates/<id>.json  근거를 확인한 후보 (원고·근거 장부·검증 결과·승인 상태)
 *   report.md          사람이 읽는 요약 (PR 본문)
 * 뉴스레터는 만들거나 보내지 않는다 (후보 추천만 보고서에 적는다).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CATEGORIES, REGISTRY_FILE, readJson } from "../ingest/lib.mjs";
import {
  DAILY_DIR,
  PROCESSED_FILE,
  automationEnabled,
  collectDaily,
  dedupeItem,
  titleSimilarity,
  gatherEvidence,
  isDateStr,
  kstToday,
  resolveMode,
  loadExisting,
  loadLimits,
  loadProcessed,
  proposeSlug,
  saveProcessed,
  sha,
  validateDraft,
} from "./lib.mjs";
import { PUBLISH_MIN, assessDepth, companyOf, distinctFacts, finalSelect, metadataScore, screenDecision } from "./select.mjs";
import { PROMPT_VERSION, generateArticle, providerBlocker, resolveModelConfig, resolveProvider } from "./providers.mjs";
import { buildDraftRecord, draftEligibility, renderDraftMarkdown, reviewDraft } from "./draft.mjs";
import { renderReport } from "./report.mjs";

const writeJson = (file, data) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
};

/**
 * @param {{ date: string, out?: string, env?: object, registry?: object, collectOnly?: boolean, processedFile?: string,
 *           existing?: object, fetch?: Function, mockReply?: any, retryDelayMs?: number, log?: Function }} opts
 */
export async function runDaily(opts) {
  const env = opts.env ?? process.env;
  const log = opts.log ?? ((m) => console.log(m));
  if (!automationEnabled(env)) {
    log("DAILY 자동화가 꺼져 있습니다 (DAILY_AUTOMATION_ENABLED=true가 아님). 아무것도 하지 않습니다.");
    return { status: "DISABLED" };
  }
  const date = opts.date;
  if (!isDateStr(date)) throw new Error(`날짜 형식 오류: ${date}`);
  const outDir = path.join(opts.out ?? DAILY_DIR, date);
  const limits = loadLimits(env);
  // 모드: 값이 없으면 shadow. draft는 명시적 수동 실행에서만, publish는 Phase 7.2 전까지 거부
  const m = resolveMode(env);
  if (m.error) {
    log(m.error);
    return { status: "REFUSED", error: m.error };
  }
  const mode = m.mode;
  if (m.warning) log(`⚠️ ${m.warning}`);
  // Shadow Mode: 수집·중복·선정·근거·보고서까지만. 키가 있어도 LLM을 부르지 않는다
  const provider = mode === "shadow" ? "none" : resolveProvider(env);
  const modelCfg = provider === "anthropic" ? resolveModelConfig(env) : null;
  const modelName = provider === "anthropic" ? modelCfg.model : provider === "mock" ? "mock" : null;
  // draft 모드인데 공급자를 쓸 수 없으면(키 없음·모델 미확인): LLM 호출 없이 안내만 하고 나머지는 shadow처럼
  const draftBlocked = mode === "draft" ? providerBlocker(provider, env) : null;
  if (draftBlocked) log(`⛔ 초안 생성 안 함: ${draftBlocked}`);
  const registry = opts.registry ?? readJson(REGISTRY_FILE, { sources: [] });
  const existing = opts.existing ?? loadExisting();
  const processedFile = opts.processedFile ?? PROCESSED_FILE;
  const processed = loadProcessed(processedFile);
  // 상한 0은 근거 확인·추천을 꺼 버린다. 백테스트(--no-fetch)처럼 의도한 경우가 아니면 경고하고 PARTIAL로
  const limitWarnings = [];
  if (!opts.allowZeroLimits) {
    if (limits.maxEvidenceFetches === 0) limitWarnings.push("근거 확인 상한(maxEvidenceFetches)이 0 — 원문 근거를 하나도 보지 않음");
    if (limits.maxPublishPerDay === 0) limitWarnings.push("발행 추천 상한(maxPublishPerDay)이 0 — 추천을 하나도 내지 않음");
  }
  const run = { date, mode, ...(m.warning ? { modeWarning: m.warning } : {}), ...(draftBlocked ? { draftBlocked } : {}), ...(limitWarnings.length ? { limitWarnings } : {}), startedAt: new Date().toISOString(), status: "", limits, provider, model: modelName, ...(opts.backtest ? { backtest: opts.backtest } : {}) };
  const budget = { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 };

  // 1) 수집
  // 백테스트는 보존된 항목을 넘겨받는다 (지금 피드를 과거 시점 데이터처럼 쓰지 않기 위해)
  const { items, sources, since } = opts.items
    ? { items: opts.items, sources: opts.sources ?? [{ id: "backtest", name: "보존 데이터", status: "success" }], since: opts.since ?? date }
    : await collectDaily({ date, registry, limits, known: existing.candidates });
  run.window = { since, until: date };
  run.sources = sources;
  log(`수집 ${items.length}건 (소스 ${sources.filter((s) => s.status === "success").length} 성공 · ${sources.filter((s) => ["failed", "blocked", "partial"].includes(s.status)).length} 실패·일부)`);
  if (opts.collectOnly) {
    writeJson(path.join(outDir, "collected.json"), { date, window: run.window, sources, items });
    run.status = sources.some((s) => ["failed", "blocked", "partial"].includes(s.status)) ? "PARTIAL" : "SUCCESS";
    return { status: run.status, items, sources, outDir };
  }

  // 2) 중복 · 3) 메타데이터 점수 · 1차 판정 (원문을 열기 전, 비용 0)
  const prevQueue = new Map();
  const qDir = path.join(outDir, "candidates");
  const dDir = path.join(outDir, "drafts");
  if (fs.existsSync(qDir)) for (const f of fs.readdirSync(qDir).filter((x) => x.endsWith(".json"))) prevQueue.set(f.replace(/\.json$/, ""), readJson(path.join(qDir, f), null));
  // 같은 날짜의 이전 초안 기록 (대기열 파일이 없어져도 같은 초안을 다시 만들지 않게)
  const prevDrafts = new Map();
  if (fs.existsSync(dDir)) for (const f of fs.readdirSync(dDir).filter((x) => x.endsWith(".json"))) prevDrafts.set(f.replace(/\.json$/, ""), readJson(path.join(dDir, f), null));
  const rows = items.map((item) => {
    const dup = dedupeItem(item, existing);
    const score = metadataScore(item, dup);
    const d = screenDecision(item, dup, score);
    const base = { item, dup, score, company: companyOf(item), facts: 0, reasons: d.reasons, needsReview: d.needsReview ?? [], stage: "metadata" };
    const prev = processed[item.id];
    if (prev && prev.date !== date && prev.decision === "PUBLISH") {
      // 지난 날짜에 이미 발행 추천까지 한 항목: 다시 근거·원고를 만들지 않는다 (그날 PR에서 승인)
      return { ...base, decision: "HOLD", reasons: [`${prev.date} DAILY에서 이미 추천함 — 그날 승인 대기열 확인`], carried: prev.date };
    }
    return { ...base, decision: d.decision };
  });

  // 3-2) 같은 날 다른 출처의 같은 발표 (예: Google DeepMind 블로그와 Google Keyword에 같은 글) → 하나만 남긴다
  const live = rows.filter((r) => r.dup.result === "NEW" || r.dup.result === "UPDATE_EXISTING");
  for (const r of live) {
    if (r.sameDayOf) continue;
    const twins = live.filter((x) => x !== r && !x.sameDayOf && titleSimilarity(x.item.title, r.item.title) >= 0.75);
    if (!twins.length) continue;
    const group = [r, ...twins].sort(
      (a, b) => (b.item.sourceType === "official") - (a.item.sourceType === "official") || b.score.priority - a.score.priority || items.indexOf(a.item) - items.indexOf(b.item),
    );
    const primary = group[0];
    primary.alsoAt = group.slice(1).map((x) => ({ url: x.item.url, source: x.item.sourceName }));
    for (const x of group.slice(1)) {
      x.sameDayOf = primary.item.id;
      x.dup = { result: "DUPLICATE", reason: `같은 날 다른 출처의 같은 발표 (${primary.item.sourceName})`, sameDayOf: primary.item.id };
      x.decision = "EXCLUDE";
      x.reasons = [`중복: ${x.dup.reason}`];
    }
  }

  // 4) 근거 확인 명단(shortlist): 하루 상한으로 미리 자르지 않는다. 원문 요청 수 상한(maxEvidenceFetches)만 적용
  const candidates = rows.filter((r) => r.decision === "CANDIDATE").sort((a, b) => b.score.priority - a.score.priority);
  const hostFails = new Map();
  let fetches = 0;
  const work = [];
  for (const r of candidates) {
    const prev = prevQueue.get(r.item.id);
    if (prev?.evidence && prev.evidence.status === "OK") {
      r.evidence = prev.evidence; // 같은 날 재실행: 원문을 다시 요청하지 않는다
    } else if (fetches < limits.maxEvidenceFetches) {
      fetches++;
      r.evidence = await gatherEvidence(r.item, { hostFails });
    } else {
      r.decision = "HOLD";
      r.reasons = [...r.reasons, `근거 확인 상한(원문 ${limits.maxEvidenceFetches}건) 초과 — 다음 실행·편집자 확인`];
      r.capStage = "evidence";
      continue;
    }
    r.stage = "evidence";
    work.push(r);
    // 접근 가능 여부는 검증 신뢰도에만 반영 (중요도·우선순위 아님)
    r.score.verificationConfidence = Math.min(3, r.score.verificationConfidence + (r.evidence.status === "OK" ? 1 : 0));
    r.facts = distinctFacts(r.evidence);
    const depth = assessDepth(r.score, r.evidence, r.facts, r.dup);
    Object.assign(r, { depth: depth.depth, sufficiency: depth.sufficiency, deepChecks: depth.deepChecks, deepMissing: depth.deepMissing });
    if (r.evidence.status !== "OK") r.needsReview.push("source_blocked");
    if (r.evidence.alternate?.matched) r.needsReview.push("alternate_evidence");
    if (!r.depth) {
      r.decision = "HOLD";
      r.reasons = [`근거 부족 (원문 ${r.evidence.status}, 확인 사실 ${r.facts}개) — 발행하지 않음`];
      r.needsReview.push("insufficient_evidence");
    } else if (r.score.priority < PUBLISH_MIN) {
      r.decision = "HOLD";
      r.reasons = [...r.reasons, `근거는 있으나 우선순위 ${r.score.priority} < 발행 추천 기준 ${PUBLISH_MIN}`];
    } else {
      r.decision = "ELIGIBLE";
    }
  }

  // 5) 최종 발행 추천: 상한 maxPublishPerDay + 회사 다양성(부드러운 규칙)
  const eligible = work.filter((r) => r.decision === "ELIGIBLE");
  const sel = finalSelect(eligible, { maxPublish: limits.maxPublishPerDay });
  for (const r of sel.picked) {
    r.decision = "PUBLISH";
    r.reasons = [...r.reasons, `근거 확인 통과 (확인 사실 ${r.facts}개, ${r.sufficiency})`];
  }
  for (const r of sel.diversityDeferred) {
    r.decision = "HOLD";
    r.capStage = "diversity";
    r.reasons = [...r.reasons, `같은 회사(${r.company}) 추천이 이미 ${2}건 — 다양성 규칙으로 뒤로 (편집자 판단)`];
  }
  for (const r of sel.capDropped) {
    r.decision = "HOLD";
    r.capStage = "final";
    r.reasons = [...r.reasons, `최종 발행 추천 상한(${limits.maxPublishPerDay}) 초과 — 편집자 판단`];
  }

  // 6) 초안 생성 (draft 모드 · 최종 추천 중 조건을 모두 충족한 후보만) · 초안 QA
  //    PUBLISH가 0건이면 이 반복이 돌지 않으므로 LLM 호출도 0
  const takenSlugs = new Set([...existing.stories.map((s) => s.slug), ...existing.editorialSlugs]);
  const ctx = { provider, env, limits, budget, categories: CATEGORIES, topics: existing.topics, fetch: opts.fetch, mockReply: opts.mockReply, retryDelayMs: opts.retryDelayMs };
  for (const r of work.filter((x) => x.decision === "PUBLISH")) {
    const prev = prevQueue.get(r.item.id);
    const prevD = prevDrafts.get(r.item.id);
    const evHash = sha(JSON.stringify(r.evidence.ledger.map((e) => e.text)));
    const gate = draftEligibility(r);
    r.draftGate = gate;
    // 재사용: 같은 근거·같은 프롬프트로 이미 만든 초안은 다시 만들지 않는다 (draft는 같은 공급자·모델일 때, shadow는 보존만)
    const old = prev?.generation?.status === "ok" && prev.draft ? { generation: prev.generation, draft: prev.draft } : prevD?.draft && prevD.generation ? { generation: { ...prevD.generation, status: "ok", at: prevD.generation.generatedAt }, draft: prevD.draft } : null;
    const reusable = old && old.generation.evidenceHash === evHash && old.generation.promptVersion === PROMPT_VERSION && (mode === "shadow" || (old.generation.provider === provider && old.generation.model === modelName));
    if (reusable && gate.ok) {
      r.generation = { ...old.generation, reused: true };
      r.draft = old.draft;
    } else {
      const skip = (error) => ({ provider: mode === "draft" ? provider : "none", model: null, status: "skipped", error });
      const g =
        mode !== "draft"
          ? skip("Shadow Mode — 원고를 만들지 않음")
          : !gate.ok
            ? { ...skip(`초안 생성 대상 아님: ${gate.reasons.join(" · ")}`), gated: true }
            : draftBlocked
              ? skip(draftBlocked)
              : await generateArticle(r.item, r.evidence, { ...ctx, suggestedDepth: r.depth });
      r.generation = {
        provider: g.provider,
        model: g.model ?? null,
        status: g.status,
        ...(g.error ? { error: g.error } : {}),
        ...(g.gated ? { gated: true } : {}),
        ...(g.usage ? { usage: { ...g.usage, costUsd: Number(g.usage.costUsd.toFixed(6)) } } : {}),
        promptVersion: PROMPT_VERSION,
        at: new Date().toISOString(),
        evidenceHash: evHash,
      };
      r.draft = g.draft ?? null;
    }
    r.proposedSlug = prev?.proposedSlug ?? proposeSlug(r.item.title, takenSlugs);
    takenSlugs.add(r.proposedSlug);
    if (r.draft) {
      const v = validateDraft(r.draft, { item: r.item, evidence: r.evidence, existing, dup: r.dup });
      r.validation = v;
      r.draftQa = reviewDraft(r.draft, { item: r.item, evidence: r.evidence, existing, dup: r.dup, suggestedDepth: r.depth });
      r.needsReview = [...new Set([...r.needsReview, ...v.needsReview, ...r.draftQa.needsReview])];
      if (v.errors.length || r.draftQa.verdict === "FAIL") {
        // FAIL 초안은 승인 대기에서 뺀다 (원고는 오류 확인용으로 drafts/에 남김)
        r.decision = "HOLD";
        const why = [...v.errors, ...r.draftQa.issues.filter((i) => i.severity === "FAIL").map((i) => i.msg)];
        r.reasons = [...r.reasons, `초안 QA FAIL: ${[...new Set(why)].slice(0, 3).join(" · ")}`];
      }
      const rec = buildDraftRecord(r, { date, generatedAt: r.generation.at });
      writeJson(path.join(dDir, `${r.item.id}.json`), rec);
      fs.writeFileSync(path.join(dDir, `${r.item.id}.md`), renderDraftMarkdown(rec));
      r.draftFile = `drafts/${r.item.id}.md`;
    }
    if (r.depth === "DEEP") r.needsReview.push("deep_requires_editor");
    r.needsReview = [...new Set(r.needsReview)];
  }

  // 7) 승인 대기열 · 기록
  fs.mkdirSync(outDir, { recursive: true });
  for (const r of work) {
    const entry = {
      id: r.item.id,
      date,
      proposedSlug: r.proposedSlug ?? null,
      title: r.draft?.title ?? null,
      sourceTitle: r.item.title,
      depth: r.draft?.editorialDepth ?? null,
      suggestedDepth: r.depth ?? null,
      depthAssessment: { sufficiency: r.sufficiency ?? null, distinctFacts: r.facts, deepChecks: r.deepChecks ?? null, deepMissing: r.deepMissing ?? null },
      company: r.company,
      alsoAt: r.alsoAt ?? [],
      category: r.draft?.category ?? null,
      summary: r.draft?.summary ?? null,
      body: r.draft ? { facts: r.draft.facts, why: r.draft.why, change: r.draft.change } : null,
      topics: r.draft?.topics ?? [],
      companies: r.draft?.companies ?? [],
      products: r.draft?.products ?? [],
      sources: [{ url: r.item.url, name: r.item.sourceName, type: r.item.sourceType, publishedAt: r.item.publishedAt }],
      candidate: r.item,
      evidence: r.evidence,
      score: r.score,
      decision: r.decision,
      reasons: r.reasons,
      needsReview: [...new Set(r.needsReview)],
      duplicate: r.dup,
      generation: r.generation ?? null,
      draft: r.draft ?? null,
      validation: r.validation ?? null,
      draftQa: r.draftQa ? { verdict: r.draftQa.verdict, checks: r.draftQa.checks, fixes: r.draftQa.fixes, stats: r.draftQa.stats } : null,
      draftGate: r.draftGate ?? null,
      draftFile: r.draftFile ?? null,
      newsletterCandidate: r.decision === "PUBLISH" && r.score.importance >= 3,
      capStage: r.capStage ?? null,
      approval: prevQueue.get(r.item.id)?.approval ?? { status: "pending" },
    };
    writeJson(path.join(qDir, `${r.item.id}.json`), entry);
    processed[r.item.id] = { date: processed[r.item.id]?.date && processed[r.item.id].date < date ? processed[r.item.id].date : date, decision: r.decision, generated: r.generation?.status === "ok" };
  }
  for (const r of rows) {
    if (r.decision === "CANDIDATE") r.decision = "HOLD"; // 이론상 남지 않지만 안전하게
    if (!processed[r.item.id]) processed[r.item.id] = { date, decision: r.decision, generated: false };
  }
  saveProcessed(processed, processedFile);

  const count = (f) => rows.filter(f).length;
  const sourceTrouble = sources.filter((s) => ["failed", "blocked", "partial"].includes(s.status));
  // 초안 문제: draft 모드에서 대상 후보인데 만들지 못한 경우(키 없음·실패·상한). 대상이 아니어서 건너뛴 것은 문제 아님
  const genTrouble = mode !== "draft" ? [] : work.filter((r) => r.generation && r.generation.status !== "ok" && !r.generation.gated);
  const valFail = work.filter((r) => r.validation?.errors?.length);
  const enabled = sources.filter((s) => s.status !== "skipped");
  run.counts = {
    collected: items.length,
    NEW: count((r) => r.dup.result === "NEW"),
    UPDATE_EXISTING: count((r) => r.dup.result === "UPDATE_EXISTING"),
    DUPLICATE: count((r) => r.dup.result === "DUPLICATE"),
    UNCERTAIN: count((r) => r.dup.result === "UNCERTAIN"),
    PUBLISH: count((r) => r.decision === "PUBLISH"),
    HOLD: count((r) => r.decision === "HOLD"),
    EXCLUDE: count((r) => r.decision === "EXCLUDE"),
    shortlisted: rows.filter((r) => r.stage === "evidence" || r.capStage === "evidence").length,
    evidenceChecked: work.length,
    drafts: work.filter((r) => r.draft).length,
    draftQa: { PASS: work.filter((r) => r.draftQa?.verdict === "PASS").length, REVIEW: work.filter((r) => r.draftQa?.verdict === "REVIEW").length, FAIL: work.filter((r) => r.draftQa?.verdict === "FAIL").length },
    validationFailures: valFail.length,
    generationSkippedOrFailed: genTrouble.length,
  };
  run.llm = {
    provider,
    model: modelName,
    calls: budget.calls,
    inputTokens: budget.inputTokens,
    outputTokens: budget.outputTokens,
    estimatedCostUsd: Number(budget.costUsd.toFixed(6)),
    maxCalls: limits.maxLlmCalls,
    maxCostUsd: limits.maxCostUsd,
    ...(modelCfg && !modelCfg.error ? { pricePerMTok: { input: modelCfg.inputPerMTok, output: modelCfg.outputPerMTok }, effort: modelCfg.effort } : {}),
  };
  run.status = enabled.length && enabled.every((s) => ["failed", "blocked"].includes(s.status)) ? "FAILED" : sourceTrouble.length || genTrouble.length || valFail.length || limitWarnings.length || draftBlocked ? "PARTIAL" : "SUCCESS";
  run.items = rows.map((r) => ({
    id: r.item.id,
    title: r.item.title,
    source: r.item.sourceName,
    publishedAt: r.item.publishedAt,
    url: r.item.url,
    duplicate: r.dup.result,
    matchSlug: r.dup.matchSlug ?? null,
    decision: r.decision,
    reasons: r.reasons,
    score: r.score.priority,
    importance: r.score.importance,
    contentType: r.score.contentType,
    typePenalty: r.score.typePenalty,
    signals: r.score.signals,
    company: r.company,
    stage: r.stage,
    ...(r.capStage ? { capStage: r.capStage } : {}),
    ...(r.stage === "evidence" ? { evidenceStatus: r.evidence.status, distinctFacts: r.facts, sufficiency: r.sufficiency, deepMissing: r.deepMissing, ...(r.evidence.alternate ? { alternate: r.evidence.alternate } : {}) } : {}),
    ...(r.depth !== undefined ? { suggestedDepth: r.depth } : {}),
    ...(r.carried ? { carriedFrom: r.carried } : {}),
  }));
  run.finishedAt = new Date().toISOString();
  writeJson(path.join(outDir, "run.json"), run);
  const queueEntries = work.map((r) => readJson(path.join(qDir, `${r.item.id}.json`), null)).filter(Boolean);
  fs.writeFileSync(path.join(outDir, "report.md"), renderReport(run, queueEntries));
  log(`상태 ${run.status} (${mode}) · 발행 추천 ${run.counts.PUBLISH} · 보류 ${run.counts.HOLD} · 제외 ${run.counts.EXCLUDE} · 초안 ${run.counts.drafts} (QA PASS ${run.counts.draftQa.PASS}·REVIEW ${run.counts.draftQa.REVIEW}·FAIL ${run.counts.draftQa.FAIL}) · LLM 호출 ${budget.calls} · 예상 비용 $${budget.costUsd.toFixed(4)}`);
  log(`→ ${path.relative(process.cwd(), outDir)}`);
  return { status: run.status, run, outDir };
}

// ---------- CLI ----------
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const arg = (k) => {
    const i = argv.indexOf(k);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const date = arg("--date") ?? kstToday();
  try {
    const r = await runDaily({ date, out: arg("--out"), collectOnly: argv.includes("--collect-only") });
    if (r.status === "FAILED" || r.status === "REFUSED") process.exitCode = 1;
  } catch (e) {
    console.error(`DAILY 실패: ${e?.message ?? e}`);
    process.exitCode = 1;
  }
}
