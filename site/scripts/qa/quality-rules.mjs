/**
 * 기사 편집 품질 규칙 (PASS / REVIEW / FAIL) — audit-quality.mjs와 주간 뉴스레터 기사 선정이 함께 쓴다.
 * 로컬 데이터만 본다 (인터넷 접속 없음). 진단일 뿐 기사를 고치지 않는다.
 */
// 원문 접근이 막혀(403·응답 없음) 원문 재확인이 어려운 출처
const BLOCKED_HOSTS = ["openai.com", "news.samsung.com"];
// '영향 없음'만 말하는 문장 (구체적 대상·조건 없이)
const FILLER = /^(일반 사용자에게\s*)?(직접적인|직접|당장)?\s*(변화|바뀌는 것|달라지는 것)(는|은)\s*없습니다\.?$/;
const norm = (t) => (t ?? "").replace(/[\s'"‘’“”·…,.()!?-]/g, "");
// 두 글의 2글자 조각 겹침 비율 (제목 반복 판별용)
function overlap(a, b) {
  const grams = (t) => { const s = norm(t); const g = new Set(); for (let i = 0; i < s.length - 1; i++) g.add(s.slice(i, i + 2)); return g; };
  const A = grams(a), B = grams(b);
  if (!A.size || !B.size) return 0;
  let n = 0;
  for (const x of A) if (B.has(x)) n++;
  return n / Math.min(A.size, B.size);
}
// 사실 문장 가운데 제목에 없는 내용의 비율 (0이면 제목을 그대로 되풀이, 1이면 전부 새 정보)
function novelty(title, text) {
  const grams = (t) => { const x = norm(t); const g = new Set(); for (let i = 0; i < x.length - 1; i++) g.add(x.slice(i, i + 2)); return g; };
  const T = grams(title), F = grams(text);
  if (!F.size) return 0;
  let n = 0;
  for (const g of F) if (!T.has(g)) n++;
  return n / F.size;
}
// 저장된 원문 요약에 더 쓸 사실이 없어, 보강하려면 원문을 다시 읽어야 하는 기사 (2026-10-05 확인)
const STORED_INFO_EXHAUSTED = new Set([
  "gemini-api-managed-agents", "copilot-for-eclipse-open-source", "gh-skill-agent-skills-cli", "claude-tag-teams",
  // 2026-10-06 확인: 저장된 원문 요약이 이미 사실 문장과 같은 내용뿐
  "meta-muse-for-small-business", "facebook-verified-free-badge", "project-glasswing-expansion", "anthropic-milan-office",
  "gemini-app-notebooks", "australia-anthropic-safety-mou", "notebooklm-cinematic-video-overviews",
  "google-ai-impact-summit-2026", "kaggle-community-benchmarks",
]);
const hasSpecific = (t) => /\d|[A-Z][A-Za-z]+/.test(t); // 숫자·고유명(제품·회사)이 하나라도 있는지

export function audit(s) {
  const fail = [], review = [];
  const facts = s.facts ?? [];
  const factText = facts.join(" ");
  const depth = s.editorialDepth;
  const host = (() => { try { return new URL(s.sourceUrl).host.replace(/^www\./, ""); } catch { return ""; } })();
  const blocked = BLOCKED_HOSTS.some((h) => host.endsWith(h));

  if (!/^https:\/\//.test(s.sourceUrl ?? "")) fail.push("원문 출처 없음");
  if (!depth) fail.push("editorialDepth 없음");

  if (depth === "deep") {
    const roles = new Set((s.sections ?? []).map((x) => x.role));
    const body = [s.lead ?? "", ...(s.sections ?? []).flatMap((x) => [...x.paragraphs, ...x.bullets])].join("");
    if (!s.lead || !s.sections?.length) fail.push("심층 본문 없음");
    for (const r of ["what", "users", "open"]) if (!roles.has(r)) fail.push(`심층 '${r}' 섹션 없음`);
    if (!roles.has("point")) review.push("AI마중 POINT(해석) 섹션 없음");
    if (!roles.has("before") && !roles.has("change") && !/이전|전까지|기존|보다|에서 .*로/.test(body)) review.push("이전 상태·변화 맥락 약함");
    if (facts.length < 3) review.push("핵심 사실 3개 미만");
    if (body.length < 800) review.push("심층치고 본문이 짧음");
    if (blocked && !(s.references ?? []).length) review.push("원문 접근 차단 출처인데 추가 확인 자료 없음");
  } else {
    const all = [s.summary, factText, s.whyItMatters, s.whatChanges].join("");
    // 무엇이 있었나: 요약·사실이 제목을 되풀이하는지
    if (overlap(s.title, s.summary) > 0.8 && overlap(s.title, factText) > 0.8) fail.push("요약·사실이 제목 반복 수준");
    else if (novelty(s.title, factText) < 0.5) review.push("사실이 제목을 거의 되풀이");
    if (!factText.trim()) fail.push("핵심 사실 비어 있음");
    if (!hasSpecific(factText)) review.push("구체적 사실(수치·제품·조건) 없음");
    // 영향: '변화 없음'만 말하는지
    if (FILLER.test((s.whatChanges ?? "").trim())) review.push("영향 설명이 '변화 없음' 한 문장");
    if ((s.whyItMatters ?? "").length < 30) review.push("왜 중요한가가 지나치게 짧음");
    // '개발자용 변화입니다.'처럼 누구에게 무엇이 달라지는지 말하지 않는 한 줄
    const weakImpact = (s.whatChanges ?? "").trim().length < 25;
    if (weakImpact) review.push("그래서 나한테는?이 한 줄 미만");
    if (weakImpact && novelty(s.title, factText) < 0.5) fail.push("사실은 제목 반복, 영향 설명도 없음");
    if (depth === "short") {
      if (all.length < 120 && facts.length <= 1) fail.push("단신치고도 본문이 거의 없음");
      else if (all.length < 150) review.push("단신 권장 분량(150자) 미달");
    } else {
      // STANDARD: 이전 상태·조건·영향까지 설명해야 함
      if (facts.length < 2) review.push("일반 기사인데 핵심 사실 1개");
      // 분량만으로 FAIL을 주지 않는다: 짧은 일반 기사는 '단신 수준'으로 표시해 보강 대상으로만 둔다
      if (all.length < 250) review.push("일반 기사인데 단신 수준 분량");
      else if (all.length < 400) review.push("일반 기사 권장 분량(400자) 미달");
      if (!/이전|기존|처음|첫|에 이어|만에|보다|부터|에서 .*로|바뀌|달라/.test(all)) review.push("이전 상태·변화 맥락 약함");
    }
  }
  const status = fail.length ? "FAIL" : review.length ? "REVIEW" : "PASS";
  // P1: 공개 상태로 두기 어려운 명백한 문제 / P2: 중요 기사(우선순위 1·2 또는 DEEP) 보강 / P3: 나머지
  const priority = status === "FAIL" ? "P1" : status === "REVIEW" ? (depth === "deep" || s.priority <= 2 ? "P2" : "P3") : null;
  // 원문을 다시 읽어야만 보강할 수 있는지 (구조·제목 반복 문제는 저장된 내용으로 고칠 수 있음)
  const structural = /섹션 없음|제목 반복|되풀이|editorialDepth/;
  const needsSourceRecheck = [...fail, ...review].some((r) => !structural.test(r)) || blocked || STORED_INFO_EXHAUSTED.has(s.slug);
  return { status, priority, reasons: [...fail, ...review], needsSourceRecheck, blocked };
}
