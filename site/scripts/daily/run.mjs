#!/usr/bin/env node
/**
 * AI마중 DAILY 실행 (Phase 7.1)
 *
 *   npm run daily:run -- [--date YYYY-MM-DD] [--out <dir>] [--collect-only]
 *   (npm run daily:collect = --collect-only)
 *
 * DAILY_AUTOMATION_ENABLED=true 일 때만 돈다 (킬 스위치).
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
  loadExisting,
  loadLimits,
  loadProcessed,
  proposeSlug,
  saveProcessed,
  sha,
  validateDraft,
} from "./lib.mjs";
import { PUBLISH_MIN, assessDepth, companyOf, distinctFacts, finalSelect, metadataScore, screenDecision } from "./select.mjs";
import { generateArticle, resolveProvider } from "./providers.mjs";
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
  const provider = resolveProvider(env);
  const registry = opts.registry ?? readJson(REGISTRY_FILE, { sources: [] });
  const existing = opts.existing ?? loadExisting();
  const processedFile = opts.processedFile ?? PROCESSED_FILE;
  const processed = loadProcessed(processedFile);
  const run = { date, startedAt: new Date().toISOString(), status: "", limits, provider, model: provider === "anthropic" ? env.DAILY_LLM_MODEL || "claude-sonnet-5-5" : null };
  const budget = { calls: 0, inputTokens: 0, outputTokens: 0 };

  // 1) 수집
  const { items, sources, since } = await collectDaily({ date, registry, limits, known: existing.candidates });
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
  if (fs.existsSync(qDir)) for (const f of fs.readdirSync(qDir).filter((x) => x.endsWith(".json"))) prevQueue.set(f.replace(/\.json$/, ""), readJson(path.join(qDir, f), null));
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

  // 6) 원고 생성 (최종 추천만) · 검증
  const takenSlugs = new Set([...existing.stories.map((s) => s.slug), ...existing.editorialSlugs]);
  const ctx = { provider, env, limits, budget, categories: CATEGORIES, topics: existing.topics, fetch: opts.fetch, mockReply: opts.mockReply, retryDelayMs: opts.retryDelayMs };
  for (const r of work.filter((x) => x.decision === "PUBLISH")) {
    const prev = prevQueue.get(r.item.id);
    const evHash = sha(JSON.stringify(r.evidence.ledger.map((e) => e.text)));
    if (prev?.generation?.status === "ok" && prev.generation.evidenceHash === evHash && prev.generation.provider === provider) {
      r.generation = prev.generation;
      r.draft = prev.draft;
    } else {
      // DEEP 제안이라도 자동 원고는 STANDARD까지만 쓴다 (DEEP은 사람이 deep 원고 작성)
      const g = await generateArticle(r.item, r.evidence, { ...ctx, suggestedDepth: r.depth === "DEEP" ? "STANDARD" : r.depth });
      r.generation = { provider: g.provider, model: g.model ?? null, status: g.status, ...(g.error ? { error: g.error } : {}), at: new Date().toISOString(), evidenceHash: evHash };
      r.draft = g.draft ?? null;
    }
    r.proposedSlug = prev?.proposedSlug ?? proposeSlug(r.item.title, takenSlugs);
    takenSlugs.add(r.proposedSlug);
    if (r.draft) {
      const v = validateDraft(r.draft, { item: r.item, evidence: r.evidence, existing, dup: r.dup });
      r.validation = v;
      r.needsReview = [...new Set([...r.needsReview, ...v.needsReview])];
      if (v.errors.length) {
        r.decision = "HOLD";
        r.reasons = [...r.reasons, `원고 검증 실패: ${v.errors.slice(0, 3).join(" · ")}`];
      }
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
  const genTrouble = work.filter((r) => r.generation && r.generation.status !== "ok");
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
    validationFailures: valFail.length,
    generationSkippedOrFailed: genTrouble.length,
  };
  run.llm = { provider, calls: budget.calls, inputTokens: budget.inputTokens, outputTokens: budget.outputTokens, maxCalls: limits.maxLlmCalls };
  run.status = enabled.length && enabled.every((s) => ["failed", "blocked"].includes(s.status)) ? "FAILED" : sourceTrouble.length || genTrouble.length || valFail.length ? "PARTIAL" : "SUCCESS";
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
    ...(r.stage === "evidence" ? { evidenceStatus: r.evidence.status, distinctFacts: r.facts, sufficiency: r.sufficiency, deepMissing: r.deepMissing } : {}),
    ...(r.depth !== undefined ? { suggestedDepth: r.depth } : {}),
    ...(r.carried ? { carriedFrom: r.carried } : {}),
  }));
  run.finishedAt = new Date().toISOString();
  writeJson(path.join(outDir, "run.json"), run);
  const queueEntries = work.map((r) => readJson(path.join(qDir, `${r.item.id}.json`), null)).filter(Boolean);
  fs.writeFileSync(path.join(outDir, "report.md"), renderReport(run, queueEntries));
  log(`상태 ${run.status} · 발행 추천 ${run.counts.PUBLISH} · 보류 ${run.counts.HOLD} · 제외 ${run.counts.EXCLUDE} · 원고 ${run.counts.drafts} · LLM 호출 ${budget.calls}`);
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
    if (r.status === "FAILED") process.exitCode = 1;
  } catch (e) {
    console.error(`DAILY 실패: ${e?.message ?? e}`);
    process.exitCode = 1;
  }
}
