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
import { ROOT, loadAllCandidates, selectionScore as score } from "./lib.mjs";

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
for (const f of fs.readdirSync(ed).filter((x) => x.endsWith(".json"))) for (const d of JSON.parse(fs.readFileSync(path.join(ed, f), "utf8"))) {
  draftIds.add(d.c);
  for (const x of d.secondary ?? []) draftIds.add(x);
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
