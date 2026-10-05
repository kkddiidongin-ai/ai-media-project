#!/usr/bin/env node
/**
 * 편집 선별 보조 (Content Selection Score) — 내부용. 점수는 사이트에 나오지 않는다.
 *   node scripts/ingest/screen.mjs 2026-03 [--top 120] [--all]
 *
 * 아직 기사로 쓰지 않은 후보를 규칙 점수 순으로 보여준다. 점수만으로 발행하지 않는다 — 편집자가 원문 설명을 보고 고른다.
 *   USER/PRODUCT  출시·제공·가격·기능·지원 종료 등 독자가 쓰는 것이 바뀌는 신호 (+)
 *   INDUSTRY      투자·인수·계약·규제·보안 사고 (+)
 *   REFERENCE     모델·벤치마크·연구 결과 (+)
 *   LOW VALUE     고객 사례, 사용법 가이드, 행사·채용·사내 인사, 일반 홍보 (-)
 */
import fs from "node:fs";
import path from "node:path";
import { ROOT, loadAllCandidates } from "./lib.mjs";

const args = process.argv.slice(2);
const month = args.find((a) => /^\d{4}-\d{2}$/.test(a));
const top = Number(args[args.indexOf("--top") + 1]) || 120;
const showAll = args.includes("--all");

const used = new Set();
for (const f of fs.readdirSync(path.join(ROOT, "content/stories")))
  for (const s of JSON.parse(fs.readFileSync(path.join(ROOT, "content/stories", f), "utf8"))) {
    used.add(s.candidateId);
    for (const x of s.secondarySources) used.add(x.candidateId);
  }
const draftIds = new Set();
const ed = path.join(ROOT, "ingest/editorial");
for (const f of fs.readdirSync(ed)) for (const d of JSON.parse(fs.readFileSync(path.join(ed, f), "utf8"))) {
  draftIds.add(d.c);
  for (const x of d.secondary ?? []) draftIds.add(x);
}

const RULES = [
  [/\b(introduc|launch|now available|generally available|\bGA\b|available (in|to|for|on)|rolling out|rolls out|released?|unveil|announc|debuts?|arrives?)/i, 3],
  [/\b(price|pricing|cost|free|plan|tier|credits?|billing|subscription)\b/i, 2],
  [/\b(deprecat|retir|sunset|end of support|no longer|removed?|breaking change)/i, 2],
  [/\b(model|gpt-|claude|gemini|grok|llama|muse|gemma|nemotron|copilot|codex|agent|api)\b/i, 1],
  [/\b(acquir|acquisition|invest|funding|raises?|valuation|partner(ship)?|agreement|deal|contract)\b/i, 2],
  [/\b(regulat|law|act\b|bill\b|government|policy|court|lawsuit|copyright|licens)/i, 2],
  [/\b(security|vulnerab|incident|breach|attack|scam|fraud|safety|jailbreak|malicious)/i, 2],
  [/\b(benchmark|leaderboard|state-of-the-art|SOTA|research|paper|discover)/i, 1],
  [/\b(korea|korean|seoul|samsung|naver|kakao|lg\b|sk\b)/i, 2],
  [/\b(how .* (uses|built|builds|scales|boosts|cuts|helps|turns|transforms)|customer story|case study)/i, -4],
  [/\b(for beginners|how to|guide|tips|best practices|cheat sheet|explained|lessons|what we learned|playbook|tutorial|deep dive|part \d)/i, -3],
  [/\b(webinar|event|summit|hackathon|meetup|register|save the date|recap|podcast|watch|award|winners|career|hiring|joins|appointed|named)\b/i, -2],
  [/\b(galaxy (tab|watch|buds|book|ring)|tv|refrigerator|washer|appliance|monitor|soundbar|unpacked|olympic)/i, -1],
];

function score(c) {
  const text = `${c.title} ${c.description.slice(0, 300)}`;
  let s = 0;
  for (const [re, w] of RULES) if (re.test(text)) s += w;
  return s;
}

const list = [...loadAllCandidates().values()]
  .filter((c) => (!month || c.publishedAt.startsWith(month)) && !used.has(c.id) && !draftIds.has(c.id))
  .map((c) => ({ c, s: score(c) }))
  .sort((a, b) => b.s - a.s || a.c.publishedAt.localeCompare(b.c.publishedAt));

const shown = showAll ? list : list.slice(0, top);
for (const { c, s } of shown) {
  console.log(`${String(s).padStart(3)} ${c.id} ${c.publishedAt.slice(5, 10)} ${c.sourceId.padEnd(16)} ${c.title.replace(/ \| .*$/, "").slice(0, 105)}`);
  if (c.description) console.log(`        ${c.description.replace(/ The post .*$/, "").slice(0, 210)}`);
}
console.log(`(${shown.length} / ${list.length} unused)`);
