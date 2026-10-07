/**
 * DAILY 보고서 (사람이 1~2분 안에 판단할 수 있게). PR 본문으로도 쓴다.
 * 로그를 늘어놓지 않고: 상태 → 숫자 → 발행 추천(카드) → 보류 → 제외(묶음) → 소스 실패 → 비용 순.
 */
const STATUS_KO = { SUCCESS: "정상", PARTIAL: "일부 실패", FAILED: "실패" };
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
};
const flags = (list) => (list?.length ? list.map((f) => FLAG_KO[f] ?? f).join(", ") : "없음");

export function renderReport(run, queue) {
  const c = run.counts;
  const L = [];
  L.push(`# AI마중 DAILY — ${run.date}`, "");
  L.push(`**상태: ${run.status} (${STATUS_KO[run.status] ?? run.status})** · 수집 창 ${run.window.since} ~ ${run.window.until} (발표일 기준)`, "");
  L.push("| 수집 | 신규 | 후속 | 중복 | 불확실 | 발행 추천 | 보류 | 제외 | 원고 |", "|---|---|---|---|---|---|---|---|---|");
  L.push(`| ${c.collected} | ${c.NEW} | ${c.UPDATE_EXISTING} | ${c.DUPLICATE} | ${c.UNCERTAIN} | ${c.PUBLISH} | ${c.HOLD} | ${c.EXCLUDE} | ${c.drafts} |`, "");
  L.push("> 자동으로 발행하지 않습니다. 아래 추천은 사람이 `npm run daily:approve -- <날짜> <id>`로 승인해야 기사 데이터에 들어갑니다. 뉴스레터도 만들거나 보내지 않습니다.", "");

  const pub = queue.filter((q) => q.decision === "PUBLISH");
  L.push(`## 발행 추천 (${pub.length})`, "");
  if (!pub.length) L.push("오늘은 발행을 추천할 만큼 근거가 충분한 소식이 없습니다. (0건도 정상입니다)", "");
  for (const [i, q] of pub.entries()) {
    L.push(`### ${i + 1}. ${q.title ?? q.sourceTitle}`);
    L.push(`- id \`${q.id}\` · 제안 slug \`${q.proposedSlug}\` · 깊이 **${q.depth ?? "-"}** (근거 기준 최대 ${q.suggestedDepth}) · 분류 ${q.category ?? "-"}`);
    L.push(`- 원문: [${q.candidate.sourceName} — ${q.sourceTitle}](${q.candidate.url}) · 발표 ${q.candidate.publishedAt.slice(0, 10)}`);
    if (q.summary) L.push(`- 요약: ${q.summary}`);
    if (q.body?.change?.text) L.push(`- 사용자 영향: ${q.body.change.text}`);
    L.push(`- 추천 이유: ${q.reasons.join(" · ")} (점수 ${q.score.total}, 한국 관련 ${q.score.koreanRelevance}/3)`);
    L.push(`- 근거: 원문 ${q.evidence.status} · 근거 문장 ${q.evidence.ledger.length}개 · 판정 ${q.evidence.grade}`);
    L.push(`- 검증: 확인 필요 ${flags(q.needsReview)}${q.validation?.errors?.length ? ` · 오류 ${q.validation.errors.join(", ")}` : ""}`);
    L.push(`- 원고: ${q.generation?.status === "ok" ? `${q.generation.provider}${q.generation.model ? ` (${q.generation.model})` : ""}` : `없음 — ${q.generation?.error ?? "생성 안 함"}`}${q.newsletterCandidate ? " · 📮 뉴스레터 후보" : ""}`);
    L.push("");
  }

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

  const bad = run.sources.filter((s) => ["failed", "blocked", "partial"].includes(s.status));
  L.push(`## 소스 상태 (성공 ${run.sources.filter((s) => s.status === "success").length} · 실패/차단/일부 ${bad.length} · 비활성 ${run.sources.filter((s) => s.status === "skipped").length})`, "");
  if (!bad.length) L.push("실패한 소스 없음");
  for (const s of bad) L.push(`- ${s.name} — **${s.status}** ${s.errors?.[0] ? `(${s.errors[0].slice(0, 120)})` : ""}`);
  L.push("");
  L.push(`## 비용`, "", `원고 생성 ${run.llm.provider} · 호출 ${run.llm.calls}/${run.llm.maxCalls} · 입력 ${run.llm.inputTokens} · 출력 ${run.llm.outputTokens} 토큰`, "");
  L.push(`<sub>실행 ${run.startedAt} → ${run.finishedAt} · 상세: run.json, candidates/*.json</sub>`, "");
  return L.join("\n");
}
