/**
 * DAILY 보고서 (사람이 1~2분 안에 판단할 수 있게). PR 본문으로도 쓴다.
 * 로그를 늘어놓지 않고: 상태 → 숫자 → 발행 추천(카드) → 보류 → 제외(묶음) → 소스 실패 → 비용 순.
 */
const STATUS_KO = { SUCCESS: "정상", PARTIAL: "일부 실패", FAILED: "실패", INCOMPLETE: "미완료 — 남은 일을 다음 실행에서 이어서" };

/** 처리 대기열 · 수집 범위 (Phase 7.2): 무엇이 남았는지, 어디서 놓쳤을 수 있는지 숨기지 않는다 */
export function renderPipeline(run) {
  const p = run.pipeline;
  if (!p) return [];
  const L = ["## 처리 대기열 · 수집 범위", ""];
  L.push(`- 진행 상태: **${p.complete ? "완료 — 남은 일 없음" : "미완료"}** · 이번 실행 근거 확인 ${p.processed.evidenceFetches}건 · 원고 작성 ${p.processed.drafted}건${p.timeBudgetExceeded ? " · ⏱️ 시간 예산 초과로 멈춤" : ""}`);
  L.push(`- 지난 실행에서 넘어온 일: 근거 확인 ${p.carriedIn.evidence}건 · 원고 작성 ${p.carriedIn.draft}건`);
  L.push(`- 남은 일 (다음 실행으로 이월): 근거 확인 대기 **${p.pending.evidence}**건 · 원고 작성 대기 **${p.pending.draft}**건 · 아직 열지 못한 글 주소 ${p.pending.meta}개 · 재시도할 소스 ${p.pending.retrySources}곳`);
  if (p.pending.draft) L.push("  - 원고 작성 대기: 발행 추천은 났지만 원고 생성 수단이 없거나(무료 생성 미설정·Shadow) 배치를 넘은 항목입니다. 근거는 후보 파일에 보존했고, 빈 원고나 허위 원고는 만들지 않습니다.");
  if (p.coverageGaps.length) {
    L.push(`- 수집 범위가 기간 전체를 덮지 못한 소스 ${p.coverageGaps.length}곳 (놓쳤을 수 있음):`);
    for (const g of p.coverageGaps.slice(0, 20)) L.push(`  - ${g.name}: ${g.reason}`);
  } else L.push("- 모든 활성 소스가 수집 기간 전체를 덮었습니다 (피드 길이·배치 기준).");
  L.push("");
  return L;
}
const FLAG_KO = {
  source_conflict: "출처끼리 다름",
  date_conflict: "날짜 불일치",
  numeric_claim: "숫자가 근거에 그대로 없음",
  price_unsupported: "가격이 근거에 없음",
  unsupported_name: "근거에 없는 이름",
  rollout_uncertain: "정식/프리뷰 구분 불확실",
  korea_claim_unsupported: "근거 없는 한국 출시 언급",
  company_claim_unattributed: "회사 주장에 출처 표시 없음",
  relative_date: "상대 날짜 표현",
  duplicate_sentence: "같은 문장 반복",
  duplicate_uncertain: "기존 기사와 같은 사안인지 불확실",
  source_blocked: "원문을 읽지 못함",
  insufficient_evidence: "근거 부족",
  deep_requires_editor: "DEEP 제안 — 사람이 심층 원고 작성",
  alternate_evidence: "공식 대체 문서 근거 — 날짜·대응 확인 필요",
  press_only: "언론 보도만 — 공식 발표 확인 필요",
};
const flags = (list) => (list?.length ? list.map((f) => FLAG_KO[f] ?? f).join(", ") : "없음");
const TYPE_KO = { NEWS: "소식", HOW_TO: "사용법", CUSTOMER_STORY: "고객 사례", INDUSTRY_STORY: "업계 이야기", THOUGHT_LEADERSHIP: "의견·전망", EVENT: "행사", HIRING: "채용·인사", DOCS_ONLY: "문서·소소한 갱신", MARKETING: "홍보", RESEARCH_PAPER: "논문" };
const DEEP_KO = { importance: "중요도 4+", novelty: "새 사안", userImpact: "사용자 영향", contextNeed: "배경 설명 필요", distinctFacts: "확인 사실 6+", evidenceQuality: "근거 PASS", standardWouldOmit: "STANDARD로는 맥락 누락" };
const short = (t, n = 60) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);
const QA_ICON = { PASS: "✅", REVIEW: "⚠️", FAIL: "⛔" };
// PR 본문 한도(65,536자) 안에 들도록 초안 본문 펼침은 이 길이까지만
const MAX_DRAFT_DETAILS = 40_000;

/** AI 초안 (draft 모드): 후보별 QA 결과 · 수정 필요 사항 · 본문(접기) */
export function renderDrafts(run, queue) {
  const withDraft = queue.filter((q) => q.draftQa);
  const gated = queue.filter((q) => q.decision === "PUBLISH" && !q.draftQa && q.generation?.status === "skipped" && run.mode === "draft");
  if (run.mode !== "draft" && !withDraft.length) return [];
  const L = [`## AI 초안 (${withDraft.length}) — 편집자 검토용 · 발행 승인 아님`, ""];
  if (run.draftBlocked) L.push(`> ⛔ **초안을 만들지 않았습니다** — ${run.draftBlocked}. LLM 호출 0회.`, "");
  L.push("> 자동 QA PASS도 발행 승인이 아닙니다. 모든 초안은 사람이 원문과 대조해 확인합니다. FAIL 초안은 승인 대기에서 빠집니다.", "");
  if (withDraft.length) {
    L.push("| 초안 | 유형 | QA | FACT | EVIDENCE | EDITORIAL | STRUCTURE | DUPLICATE | SAFETY | 파일 |", "|---|---|---|---|---|---|---|---|---|---|");
    for (const q of withDraft) {
      const c = q.draftQa.checks;
      L.push(`| ${short(q.title ?? q.sourceTitle, 40).replace(/\|/g, "/")} | ${q.depth ?? "-"} | ${QA_ICON[q.draftQa.verdict]} ${q.draftQa.verdict} | ${["FACT", "EVIDENCE", "EDITORIAL", "STRUCTURE", "DUPLICATE", "SAFETY"].map((k) => QA_ICON[c[k].result]).join(" | ")} | \`${q.draftFile}\` |`);
    }
    L.push("");
  }
  let budget = MAX_DRAFT_DETAILS;
  for (const q of withDraft) {
    const g = q.generation ?? {};
    L.push(`### ${QA_ICON[q.draftQa.verdict]} ${q.title ?? q.sourceTitle}`);
    L.push(`- 후보 \`${q.id}\` · 원문 [${q.candidate.sourceName}](${q.candidate.url}) · 발표 ${q.candidate.publishedAt.slice(0, 10)} · 유형 ${q.depth ?? "-"} (근거 기준 최대 ${q.suggestedDepth}) · 본문 ${q.draftQa.stats?.bodyChars ?? "-"}자`);
    L.push(`- 생성: ${g.provider} · ${g.model ?? "-"}${g.reused ? " · 이전 초안 재사용(추가 호출 없음)" : ""} · 토큰 ${g.usage?.inputTokens ?? 0}/${g.usage?.outputTokens ?? 0} · $${(g.usage?.costUsd ?? 0).toFixed(4)}`);
    L.push(`- 수정 필요 사항: ${q.draftQa.fixes.length ? "" : "자동 점검 항목 없음"}`);
    for (const f of q.draftQa.fixes.slice(0, 8)) L.push(`  - ${f}`);
    if (q.draftQa.fixes.length > 8) L.push(`  - … 외 ${q.draftQa.fixes.length - 8}건 (${q.draftFile})`);
    const art = [
      `**${q.title ?? ""}**`,
      "",
      `**핵심 요약** ${q.draft?.summary ?? ""}`,
      "",
      "**무엇이 달라졌나** (공식 발표로 확인된 사실)",
      ...(q.draft?.facts ?? []).map((f) => `- ${f.text} \`${(f.evidence ?? []).join(",")}\``),
      "",
      `**왜 중요한가** (AI마중의 해석) ${q.draft?.why?.text ?? ""}`,
      ...(q.draft?.change?.text ? ["", q.draft.change.text] : []),
      "",
      "**독자가 확인할 사항**",
      ...(q.draft?.checks ?? []).map((c) => `- ${c.text}`),
      "",
      "**아직 확인되지 않은 부분**",
      ...(q.draft?.unknowns ?? []).map((u) => `- ${u}`),
    ].join("\n");
    if (art.length <= budget) {
      budget -= art.length;
      L.push("", "<details><summary>초안 본문 보기</summary>", "", art, "", "</details>");
    } else L.push(`- 본문: \`${q.draftFile}\` (보고서 길이 한도로 생략)`);
    L.push("");
  }
  if (gated.length) {
    L.push(`**초안을 만들지 않은 발행 추천 ${gated.length}건**`);
    for (const q of gated) L.push(`- ${short(q.sourceTitle)} — ${q.generation.error}`);
    L.push("");
  }
  return L;
}

/** 선정 진단: 왜 골랐고 왜 뺐는지 1~2분 안에 확인 */
export function renderDiagnostics(run) {
  const items = run.items ?? [];
  if (!items.some((i) => i.stage)) return [];
  const L = ["## 선정 진단 (Selection Diagnostics)", ""];
  const byPrio = [...items].filter((i) => i.duplicate !== "DUPLICATE").sort((a, b) => b.score - a.score);
  L.push("**메타데이터 상위 10** (원문을 열기 전 점수 · 유형 · 사건 신호 → 결과)");
  for (const i of byPrio.slice(0, 10)) L.push(`- ${i.score} · ${TYPE_KO[i.contentType] ?? i.contentType}${i.typePenalty ? ` ${i.typePenalty}` : ""} · ${(i.signals ?? []).join("·") || "신호 없음"} — ${short(i.title)} → **${i.decision}**`);
  const sl = items.filter((i) => i.stage === "evidence");
  L.push("", `**근거 확인 명단 ${sl.length}건** (원문 요청 상한 ${run.limits.maxEvidenceFetches}, 최종 추천 상한 ${run.limits.maxPublishPerDay})`);
  for (const i of sl.sort((a, b) => b.score - a.score)) L.push(`- ${short(i.title)} — 원문 ${i.evidenceStatus}${i.alternate ? ` (대체 문서 ${i.alternate.matched}줄${i.alternate.reason ? `: ${i.alternate.reason}` : ""})` : ""} · 확인 사실 ${i.distinctFacts} · ${i.sufficiency ?? "-"} · 깊이 ${i.suggestedDepth ?? "-"} → **${i.decision}**`);
  const capped = items.filter((i) => i.capStage);
  L.push("", `**상한·다양성으로 빠진 후보 ${capped.length}건**`);
  if (!capped.length) L.push("- 없음");
  for (const i of capped) L.push(`- ${short(i.title)} — ${{ evidence: "근거 요청 상한", final: "최종 추천 상한", diversity: "회사 다양성" }[i.capStage]} (우선순위 ${i.score})`);
  const pen = items.filter((i) => i.typePenalty < 0 && i.duplicate !== "DUPLICATE");
  L.push("", `**글 유형 감점 ${pen.length}건**: ${pen.slice(0, 12).map((i) => `${short(i.title, 40)} (${TYPE_KO[i.contentType] ?? i.contentType}, ${i.decision})`).join(" · ") || "없음"}${pen.length > 12 ? " …" : ""}`);
  const deepish = sl.filter((i) => i.suggestedDepth === "DEEP" || (i.importance >= 3 && i.suggestedDepth));
  L.push("", "**DEEP 판단**");
  if (!deepish.length) L.push("- 해당 없음");
  for (const i of deepish) L.push(i.suggestedDepth === "DEEP" ? `- ${short(i.title)} → DEEP 제안 (7개 조건 모두 충족, 자동 원고·발행 아님)` : `- ${short(i.title)} → ${i.suggestedDepth} (DEEP 아님: ${(i.deepMissing ?? []).map((k) => DEEP_KO[k] ?? k).join(", ")})`);
  const holds = items.filter((i) => i.decision === "HOLD");
  const groups = {};
  for (const i of holds) {
    const k = (i.reasons.at(-1) ?? "").replace(/\d+/g, "N").replace(/\(.*?\)/g, "").replace(/ — .*$/, "").trim().slice(0, 50);
    groups[k] = (groups[k] ?? 0) + 1;
  }
  L.push("", `**보류 이유 (${holds.length}건)**: ${Object.entries(groups).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(" · ") || "없음"}`, "");
  return L;
}

/** 소스 상태 (Phase 7.1.5): OK · WARNING · DEGRADED · FAILED · SKIPPED. 정상적인 0건(NO_NEW)은 따로 센다 */
export function renderSourceHealth(run) {
  const L = [];
  const src = run.sources ?? [];
  const h = (k) => src.filter((s) => s.health === k).length;
  const hasHealth = src.some((s) => s.health);
  if (!hasHealth) {
    const bad = src.filter((s) => ["failed", "blocked", "partial"].includes(s.status));
    L.push(`## 소스 상태 (성공 ${src.filter((s) => s.status === "success").length} · 실패/차단/일부 ${bad.length} · 비활성 ${src.filter((s) => s.status === "skipped").length})`, "");
    if (!bad.length) L.push("실패한 소스 없음");
    for (const s of bad) L.push(`- ${s.name} — **${s.status}** ${s.errors?.[0] ? `(${s.errors[0].slice(0, 120)})` : ""}`);
    L.push("");
    return L;
  }
  const noNew = src.filter((s) => s.healthNote === "NO_NEW").length;
  L.push(`## 소스 상태 (정상 ${h("OK")}${noNew ? `, 그중 기간 안 새 글 0건 ${noNew}` : ""} · 경고 ${h("WARNING")} · 저하 ${h("DEGRADED")} · 실패 ${h("FAILED")} · 비활성 ${h("SKIPPED")})`, "");
  const issues = src.filter((s) => ["WARNING", "DEGRADED", "FAILED"].includes(s.health));
  if (!issues.length) L.push("경고 없음 — 모든 활성 소스가 요청·파싱 정상 (기간 안 새 글이 없는 소스는 발표가 없었던 것으로 봄)");
  else {
    L.push("| 소스 | 상태 | HTTP | 글 주소(형식 일치/전체) | 기간 안 | 연속 0건 | 최근 정상 수집 | 이유 |", "|---|---|---|---|---|---|---|---|");
    const order = { FAILED: 0, DEGRADED: 1, WARNING: 2 };
    for (const s of issues.sort((a, b) => order[a.health] - order[b.health]))
      L.push(`| ${s.name} | **${s.health}** | ${s.http?.status ?? "-"}${s.http?.redirected ? " ↪" : ""} | ${s.matched ?? "-"}/${s.parsed ?? "-"} | ${s.inWindow ?? "-"} | ${s.zeroStreak ?? "-"} | ${s.lastOkDate ?? "-"} | ${(s.healthReasons ?? []).join(" · ").replace(/\|/g, "/").slice(0, 220)} |`);
    const undated = issues.flatMap((s) => (s.undatedItems ?? []).map((u) => ({ ...u, source: s.name })));
    if (undated.length) L.push("", `발행일을 확인하지 못해 후보에서 뺀 글 (임의 날짜로 넣지 않음): ${undated.slice(0, 6).map((u) => `${u.title || u.url} (${u.source})`).join(" · ")}`);
  }
  L.push("");
  return L;
}

export function renderReport(run, queue) {
  const c = run.counts;
  const L = [];
  L.push(run.kind === "backfill" ? `# AI마중 DAILY 백필 — ${run.backfill.from} ~ ${run.backfill.to}` : `# AI마중 DAILY — ${run.date}`, "");
  if (run.kind === "backfill")
    L.push(`> 🔁 **수집 공백 백필** — 발표일 ${run.backfill.from} ~ ${run.backfill.to}를 다시 수집했습니다 (언제나 Shadow). 결과는 편집자 검토용이며 기사·뉴스레터·배포를 바꾸지 않습니다. 날짜별 DAILY 결과와 따로 저장합니다.`, "");
  if (run.mode === "shadow") L.push("> 🕶️ **Shadow Mode** — 수집·중복·선정·근거 확인·보고서까지만 실행했습니다. '발행 추천'은 **편집자 검토용 추천**이며, 원고 생성(LLM)·기사 발행·뉴스레터·배포는 하지 않습니다.", "");
  if (run.mode === "draft") L.push("> ✍️ **Draft Mode (수동 실행)** — 검증된 발행 추천 후보에만 AI 초안을 만들고 자동 QA를 했습니다. 초안은 **편집자 검토용**이며 발행 승인이 아닙니다. 기사 발행·뉴스레터·배포는 하지 않습니다.", "");
  if (run.modeWarning) L.push(`> ⚠️ **모드** — ${run.modeWarning}`, "");
  if (run.draftBlocked) L.push(`> ⛔ **초안 생성 안 함** — ${run.draftBlocked}`, "");
  if (run.limitWarnings?.length) L.push(`> ⚠️ **설정 경고** — ${run.limitWarnings.join(" · ")}. 상한 설정을 확인하세요.`, "");
  if (run.backtest) L.push(`> 🔁 **Backtest** — ${run.backtest.note}`, "");
  L.push(`**상태: ${run.status} (${STATUS_KO[run.status] ?? run.status})** · 수집 창 ${run.window.since} ~ ${run.window.until} (발표일 기준${run.window.reason ? ` · ${run.window.reason}` : ""})`, "");
  if (run.window.gapFrom) L.push(`> ⚠️ **수집 공백** — 마지막 실행(${run.window.gapFrom}) 이후가 따라잡기 한도보다 깁니다. 빠진 기간은 \`--from/--to\` 백필로 확인하세요.`, "");
  L.push("| 수집 | 신규 | 후속 | 중복 | 불확실 | 발행 추천 | 보류 | 제외 | 원고 |", "|---|---|---|---|---|---|---|---|---|");
  L.push(`| ${c.collected} | ${c.NEW} | ${c.UPDATE_EXISTING} | ${c.DUPLICATE} | ${c.UNCERTAIN} | ${c.PUBLISH} | ${c.HOLD} | ${c.EXCLUDE} | ${c.drafts} |`, "");
  L.push("> 자동으로 발행하지 않습니다. 아래 추천은 사람이 `npm run daily:approve -- <날짜> <id>`로 승인해야 기사 데이터에 들어갑니다. 뉴스레터도 만들거나 보내지 않습니다.", "");

  const pub = queue.filter((q) => q.decision === "PUBLISH");
  L.push(`## 발행 추천 (${pub.length})${run.mode === "shadow" ? " — 편집자 검토용" : ""}`, "");
  if (!pub.length) L.push("오늘은 발행을 추천할 만큼 근거가 충분한 소식이 없습니다. (0건도 정상입니다)", "");
  for (const [i, q] of pub.entries()) {
    L.push(`### ${i + 1}. ${q.title ?? q.sourceTitle}`);
    L.push(`- id \`${q.id}\` · 제안 slug \`${q.proposedSlug}\` · 깊이 **${q.depth ?? "-"}** (근거 기준 최대 ${q.suggestedDepth}) · 분류 ${q.category ?? "-"}`);
    L.push(`- 원문: [${q.candidate.sourceName} — ${q.sourceTitle}](${q.candidate.url}) · 발표 ${q.candidate.publishedAt.slice(0, 10)}`);
    if (q.summary) L.push(`- 요약: ${q.summary}`);
    if (q.body?.change?.text) L.push(`- 사용자 영향: ${q.body.change.text}`);
    L.push(`- 추천 이유: ${q.reasons.join(" · ")} (중요도 ${q.score.importance}/5, 한국 관련 ${q.score.koreanRelevance}/3${q.score.contentType && q.score.contentType !== "NEWS" ? `, 유형 ${q.score.contentType}` : ""})`);
    L.push(`- 근거: 원문 ${q.evidence.status} · 근거 문장 ${q.evidence.ledger.length}개 · 서로 다른 확인 사실 ${q.depthAssessment?.distinctFacts ?? "-"}개 · 판정 ${q.evidence.grade}${q.suggestedDepth === "DEEP" ? " · DEEP 제안(7개 조건 충족)" : q.depthAssessment?.deepMissing?.length ? ` · DEEP 아님(${q.depthAssessment.deepMissing.map((k) => DEEP_KO[k] ?? k).join(", ")})` : ""}`);
    L.push(`- 검증: 확인 필요 ${flags(q.needsReview)}${q.validation?.errors?.length ? ` · 오류 ${q.validation.errors.join(", ")}` : ""}`);
    L.push(`- 원고: ${q.generation?.status === "ok" ? `${q.generation.provider}${q.generation.model ? ` (${q.generation.model})` : ""}${q.draftQa ? ` · 초안 QA ${QA_ICON[q.draftQa.verdict]} ${q.draftQa.verdict} · \`${q.draftFile}\`` : ""}` : `없음 — ${q.generation?.error ?? "생성 안 함"}`}${q.newsletterCandidate ? " · 📮 뉴스레터 후보" : ""}`);
    L.push("");
  }

  L.push(...renderDrafts(run, queue));

  const holdQ = queue.filter((q) => q.decision === "HOLD");
  const holdOther = run.items.filter((x) => x.decision === "HOLD" && !holdQ.some((q) => q.id === x.id));
  L.push(`## 보류 (${run.counts.HOLD})`, "");
  if (!run.counts.HOLD) L.push("없음", "");
  for (const q of holdQ) L.push(`- **${q.sourceTitle}** (${q.candidate.sourceName}, ${q.candidate.publishedAt.slice(0, 10)}) — ${q.reasons.join(" · ")} · 확인 필요: ${flags(q.needsReview)}`);
  for (const x of holdOther.slice(0, 20)) L.push(`- ${x.title} (${x.source}, ${x.publishedAt.slice(0, 10)}) — ${x.reasons.join(" · ")}`);
  if (holdOther.length > 20) L.push(`- … 외 ${holdOther.length - 20}건 (run.json)`);
  L.push("");

  const ex = run.items.filter((x) => x.decision === "EXCLUDE");
  L.push(`## 제외 (${ex.length})`, "");
  const dupes = ex.filter((x) => x.duplicate === "DUPLICATE");
  if (dupes.length) L.push(`- 중복 ${dupes.length}건: ${dupes.slice(0, 8).map((x) => `${x.title.slice(0, 50)}${x.matchSlug ? ` → \`${x.matchSlug}\`` : ""}`).join(" · ")}${dupes.length > 8 ? " …" : ""}`);
  const low = ex.filter((x) => x.duplicate !== "DUPLICATE");
  if (low.length) L.push(`- 가치 낮음 ${low.length}건: ${low.slice(0, 8).map((x) => x.title.slice(0, 50)).join(" · ")}${low.length > 8 ? " …" : ""}`);
  if (!ex.length) L.push("없음");
  L.push("");

  L.push(...renderSourceHealth(run));
  L.push(...renderPipeline(run));
  L.push(...renderDiagnostics(run));
  L.push(`## 비용`, "", `원고 생성 ${run.llm.provider}${run.llm.model ? ` (${run.llm.model}${run.llm.effort ? `, effort ${run.llm.effort}` : ""})` : ""} · 호출 ${run.llm.calls}/${run.llm.maxCalls} · 입력 ${run.llm.inputTokens} · 출력 ${run.llm.outputTokens} 토큰 · 예상 비용 $${(run.llm.estimatedCostUsd ?? 0).toFixed(4)} / 상한 $${run.llm.maxCostUsd ?? "-"}${run.llm.pricePerMTok ? ` (요금 입력 $${run.llm.pricePerMTok.input}·출력 $${run.llm.pricePerMTok.output} / 100만 토큰)` : ""}`, "");
  L.push(`<sub>실행 ${run.startedAt} → ${run.finishedAt} · 상세: run.json, candidates/*.json</sub>`, "");
  return L.join("\n");
}
