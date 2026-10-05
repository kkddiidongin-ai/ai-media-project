#!/usr/bin/env node
/**
 * 콘텐츠 DB 점검 (빌드와 별도로 실행)
 *   node scripts/qa/check-content.mjs
 *
 * - 중복: slug, 원문 URL, 후보 id가 두 기사에 쓰이지 않았는지
 * - 날짜: eventDate가 원문 발표일과 같은지, 미래가 아닌지, 파일 안 정렬(최신 → 과거)
 * - 주제: 모든 topic이 topics.json에 있는지, 기사가 0건인 주제 목록
 * - 차트·카드뉴스: 연결된 기사가 실제로 있는지
 * - 출처 추적: 모든 기사의 후보 기록(발견 경로·수집 시각)이 ingest/candidates에 남아 있는지
 * - 반복 문구 (Phase 6.4): 요약·왜 중요한가·그래서 나한테는?에서 같은 문장이 여러 기사에 되풀이되는지
 *   · 같은 문장이 REPEAT_LIMIT건을 넘으면 오류 (판에 박힌 문장 방지)
 *   · '직접적인 변화는 없습니다' 류 문장이 전체 '그래서 나한테는?'의 FILLER_LIMIT를 넘으면 오류
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "../..");
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const dir = (p) => fs.readdirSync(path.join(ROOT, p)).filter((f) => f.endsWith(".json"));

const errors = [];
const warn = [];
const today = new Date().toISOString().slice(0, 10);

const topics = new Set(read("content/topics.json").map((t) => t.slug));
const candidates = new Map();
for (const f of dir("ingest/candidates")) for (const c of read(`ingest/candidates/${f}`)) candidates.set(c.id, c);

const stories = [];
for (const f of dir("content/stories")) {
  const list = read(`content/stories/${f}`);
  for (let i = 1; i < list.length; i++) if (list[i - 1].eventDate < list[i].eventDate) errors.push(`${f}: 정렬 어긋남 (${list[i - 1].slug} → ${list[i].slug})`);
  for (const s of list) {
    if (!f.startsWith(s.eventDate.slice(0, 7))) errors.push(`${f}: ${s.slug}의 eventDate ${s.eventDate}가 파일 월과 다름`);
    stories.push(s);
  }
}

const seen = { slug: new Map(), url: new Map(), cand: new Map() };
// 명백한 편집 오류 (DAILY_PUBLISHING.md 기준): 등급 없음 · 출처 없음 · 본문이 제목 그대로 · 사실·영향이 빈 기사
const flat = (t) => (t ?? "").replace(/[\s'"‘’“”·…,.!?]/g, "");
for (const s of stories) {
  if (!["deep", "standard", "short"].includes(s.editorialDepth)) errors.push(`${s.slug}: editorialDepth 없음`);
  if (!/^https?:\/\//.test(s.sourceUrl ?? "")) errors.push(`${s.slug}: 원문 출처 없음`);
  if (flat(s.summary) === flat(s.title) || (s.facts ?? []).some((x) => flat(x) === flat(s.title))) errors.push(`${s.slug}: 요약·사실이 제목과 같음`);
  if (!(s.facts ?? []).some((x) => x.trim().length >= 20) || (s.whatChanges ?? "").trim().length < 10) errors.push(`${s.slug}: 핵심 사실 또는 '그래서 나한테는?'이 사실상 비어 있음`);
}
for (const s of stories) {
  for (const [k, v] of [["slug", s.slug], ["url", s.sourceUrl], ["cand", s.candidateId]]) {
    if (seen[k].has(v)) errors.push(`중복 ${k}: ${v} (${seen[k].get(v)}, ${s.slug})`);
    seen[k].set(v, s.slug);
  }
  if (s.eventDate > today) errors.push(`${s.slug}: 미래 날짜 ${s.eventDate}`);
  if (s.eventDate !== s.sourcePublishedAt.slice(0, 10)) warn.push(`${s.slug}: eventDate ${s.eventDate} ≠ 원문 발표일 ${s.sourcePublishedAt.slice(0, 10)}`);
  for (const t of s.topics) if (!topics.has(t)) errors.push(`${s.slug}: 없는 topic ${t}`);
  const c = candidates.get(s.candidateId);
  if (!c) errors.push(`${s.slug}: 후보 기록 ${s.candidateId} 없음 (출처 추적 불가)`);
  else if (c.url !== s.sourceUrl) errors.push(`${s.slug}: 후보 URL과 기사 원문 URL 불일치`);
  for (const x of s.secondarySources) if (!candidates.has(x.candidateId)) errors.push(`${s.slug}: 추가 출처 후보 ${x.candidateId} 없음`);
}

const slugs = new Set(stories.map((s) => s.slug));
for (const f of dir("content/charts")) {
  const c = read(`content/charts/${f}`);
  for (const r of [...c.relatedStories, ...c.items.map((i) => i.storySlug).filter(Boolean)]) if (!slugs.has(r)) errors.push(`chart ${c.slug}: 기사 ${r} 없음`);
  if (!c.checkedAt || !c.sources?.length) errors.push(`chart ${c.slug}: 출처·확인일 없음`);
}
for (const f of dir("content/cardnews")) {
  const c = read(`content/cardnews/${f}`);
  for (const r of c.storySlugs) if (!slugs.has(r)) errors.push(`cardnews ${c.slug}: 기사 ${r} 없음`);
}

// ---------- 반복 문구 ----------
const REPEAT_LIMIT = 3; // 같은 문장이 4개 기사 이상에 나오면 오류
const FILLER_LIMIT = 0.3; // '직접적인 변화 없음'만 쓴 기사 비율 상한
const ALLOWED_REPEAT = new Set(["직접적인 변화는 없습니다."]); // 사실 그대로일 때 쓰는 짧은 표준 문장 (비율로 따로 관리)
const sentences = (t) =>
  (t ?? "")
    .split(/(?<=[.?!다요])\s+/)
    .map((x) => x.trim())
    .filter((x) => x.length >= 12);
const phraseUse = new Map();
for (const s of stories)
  for (const field of ["summary", "whyItMatters", "whatChanges", "lead"])
    for (const sen of new Set(sentences(s[field]))) {
      if (!phraseUse.has(sen)) phraseUse.set(sen, []);
      phraseUse.get(sen).push(`${s.slug}#${field}`);
    }
// 심층 기사 본문도 같은 기준으로 본다 (기사 사이 반복 + 한 기사 안 같은 문장 반복)
for (const s of stories.filter((x) => x.sections))
  for (const sec of s.sections)
    for (const t of [...sec.paragraphs, ...sec.bullets])
      for (const sen of sentences(t)) {
        if (!phraseUse.has(sen)) phraseUse.set(sen, []);
        phraseUse.get(sen).push(`${s.slug}#${sec.role}`);
      }
const repeated = [...phraseUse].filter(([sen, where]) => where.length > REPEAT_LIMIT && !ALLOWED_REPEAT.has(sen)).sort((a, b) => b[1].length - a[1].length);
for (const [sen, where] of repeated) errors.push(`반복 문구 ${where.length}회: "${sen}" (${where.slice(0, 3).join(", ")} …)`);
const fillerOnly = stories.filter((s) => /^직접적인 변화(는|가) 없습니다\.?$/.test(s.whatChanges.trim()));
const fillerStart = stories.filter((s) => s.whatChanges.trim().startsWith("직접적인 변화"));
const fillerRatio = fillerOnly.length / stories.length;
console.log(`phrases: 4회 이상 반복 문장 ${repeated.length}개 · '그래서 나한테는?'이 '직접적인 변화 없음'뿐인 기사 ${fillerOnly.length}건 (${(fillerRatio * 100).toFixed(1)}%), 그 문장으로 시작하는 기사 ${fillerStart.length}건`);
if (fillerRatio > FILLER_LIMIT) errors.push(`'직접적인 변화는 없습니다'만 쓴 기사 비율 ${(fillerRatio * 100).toFixed(1)}% > ${FILLER_LIMIT * 100}%`);
const top = [...phraseUse].filter(([, w]) => w.length > 1).sort((a, b) => b[1].length - a[1].length).slice(0, 5);
for (const [sen, w] of top) console.log(`  반복 상위 ${w.length}회: ${sen.slice(0, 50)}`);

const topicCount = new Map([...topics].map((t) => [t, 0]));
for (const s of stories) for (const t of s.topics) topicCount.set(t, topicCount.get(t) + 1);
const empty = [...topicCount].filter(([, n]) => n === 0).map(([t]) => t);

const byMonth = {};
for (const s of stories) byMonth[s.eventDate.slice(0, 7)] = (byMonth[s.eventDate.slice(0, 7)] ?? 0) + 1;
console.log(`stories ${stories.length} · issues ${new Set(stories.map((s) => s.eventDate)).size} · candidates ${candidates.size}`);
console.log(`by month ${JSON.stringify(byMonth)}`);
console.log(`topics ${topics.size} (기사 0건: ${empty.join(", ") || "없음"})`);
for (const w of warn) console.log(`warn  ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`ERROR ${e}`);
  process.exit(1);
}
console.log("OK — 중복·날짜·주제·연결·출처 추적 이상 없음");
