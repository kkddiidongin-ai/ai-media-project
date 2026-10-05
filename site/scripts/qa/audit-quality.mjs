#!/usr/bin/env node
/**
 * 편집 품질 진단 (로컬 데이터만, 인터넷 접속 없음)
 *   node scripts/qa/audit-quality.mjs          → 요약 출력
 *   node scripts/qa/audit-quality.mjs --write  → ingest/review-queue.json 갱신
 *
 * DAILY_PUBLISHING.md의 SHORT / STANDARD / DEEP 기준을 기계적으로 점검해 PASS / REVIEW / FAIL로 나눈다.
 * 글자 수 하나로 FAIL을 주지 않는다. 제목 반복·사실 부족·영향 설명 부족·구조 부족을 함께 본다.
 * 진단일 뿐 기사를 고치지 않는다. 보강은 원문을 다시 확인한 뒤 사람이 한다.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "../..");
const stories = [];
for (const f of fs.readdirSync(path.join(ROOT, "content/stories")).filter((f) => f.endsWith(".json")))
  stories.push(...JSON.parse(fs.readFileSync(path.join(ROOT, "content/stories", f), "utf8")));

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
const hasSpecific = (t) => /\d|[A-Z][A-Za-z]+/.test(t); // 숫자·고유명(제품·회사)이 하나라도 있는지

function audit(s) {
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
    else if (overlap(s.title, factText) > 0.85 && facts.length === 1) review.push("사실이 제목을 거의 되풀이");
    if (!factText.trim()) fail.push("핵심 사실 비어 있음");
    if (!hasSpecific(factText)) review.push("구체적 사실(수치·제품·조건) 없음");
    // 영향: '변화 없음'만 말하는지
    if (FILLER.test((s.whatChanges ?? "").trim())) review.push("영향 설명이 '변화 없음' 한 문장");
    if ((s.whyItMatters ?? "").length < 30) review.push("왜 중요한가가 지나치게 짧음");
    // '개발자용 변화입니다.'처럼 누구에게 무엇이 달라지는지 말하지 않는 한 줄
    const weakImpact = (s.whatChanges ?? "").trim().length < 25;
    if (weakImpact) review.push("그래서 나한테는?이 한 줄 미만");
    if (weakImpact && overlap(s.title, factText) > 0.85) fail.push("사실은 제목 반복, 영향 설명도 없음");
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
  const needsSourceRecheck = [...fail, ...review].some((r) => !structural.test(r)) || blocked;
  return { status, priority, reasons: [...fail, ...review], needsSourceRecheck, blocked };
}

const rows = stories.map((s) => ({ s, ...audit(s) }));
const tally = {};
for (const r of rows) {
  for (const k of [r.s.editorialDepth, "ALL"]) {
    tally[k] ??= { PASS: 0, REVIEW: 0, FAIL: 0 };
    tally[k][r.status]++;
  }
}
console.log("depth   PASS REVIEW FAIL");
for (const k of ["deep", "standard", "short", "ALL"]) console.log(k.padEnd(8), tally[k] ? `${tally[k].PASS} ${tally[k].REVIEW} ${tally[k].FAIL}` : "-");
const pr = { P1: 0, P2: 0, P3: 0 };
const reasons = {};
for (const r of rows) {
  if (r.priority) pr[r.priority]++;
  for (const x of r.reasons) reasons[x] = (reasons[x] ?? 0) + 1;
}
console.log("priority", JSON.stringify(pr));
console.log("top reasons:");
for (const [k, n] of Object.entries(reasons).sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`  ${n}  ${k}`);
console.log("needsSourceRecheck", rows.filter((r) => r.status !== "PASS" && r.needsSourceRecheck).length);
for (const r of rows.filter((r) => r.status === "FAIL")) console.log("FAIL", r.s.slug, "—", r.reasons.join(", "));

if (process.argv.includes("--write")) {
  const queue = rows
    .filter((r) => r.status !== "PASS")
    .sort((a, b) => a.priority.localeCompare(b.priority) || b.s.eventDate.localeCompare(a.s.eventDate))
    .map((r) => ({
      slug: r.s.slug,
      date: r.s.eventDate,
      company: r.s.companies[0] ?? r.s.sourceName,
      currentDepth: r.s.editorialDepth,
      status: r.status,
      priority: r.priority,
      reason: r.reasons.join(" · "),
      needsSourceRecheck: r.needsSourceRecheck,
    }));
  const out = path.join(ROOT, "ingest/review-queue.json");
  fs.writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString().slice(0, 10), generator: "scripts/qa/audit-quality.mjs", count: queue.length, items: queue }, null, 2) + "\n");
  console.log(`→ ${path.relative(ROOT, out)} (${queue.length}건)`);
}
