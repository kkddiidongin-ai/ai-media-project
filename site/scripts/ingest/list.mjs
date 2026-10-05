#!/usr/bin/env node
/**
 * 편집용 후보 목록 보기.
 *   node scripts/ingest/list.mjs 2026-01            → id | 날짜 | 소스 | 제목
 *   node scripts/ingest/list.mjs 2026-01 --desc     → 설명(피드/메타 description)까지
 *   node scripts/ingest/list.mjs --ids a1b2c3,d4e5f6 → 특정 후보 전체 기록
 * 이미 기사(content/stories)로 쓴 후보에는 ✓ 표시.
 */
import fs from "node:fs";
import path from "node:path";
import { ROOT, loadAllCandidates } from "./lib.mjs";

const args = process.argv.slice(2);
const all = [...loadAllCandidates().values()];
const used = new Set();
const storyDir = path.join(ROOT, "content", "stories");
if (fs.existsSync(storyDir)) {
  for (const f of fs.readdirSync(storyDir).filter((f) => f.endsWith(".json"))) {
    for (const s of JSON.parse(fs.readFileSync(path.join(storyDir, f), "utf8"))) {
      if (s.candidateId) used.add(s.candidateId);
      for (const x of s.secondarySources ?? []) if (x.candidateId) used.add(x.candidateId);
    }
  }
}

const idsArg = args.indexOf("--ids");
if (idsArg >= 0) {
  const ids = new Set(args[idsArg + 1].split(","));
  for (const c of all.filter((c) => ids.has(c.id))) console.log(JSON.stringify(c, null, 1));
  process.exit(0);
}

const month = args.find((a) => /^\d{4}-\d{2}$/.test(a));
const withDesc = args.includes("--desc");
const src = args.find((a) => a.startsWith("--src="))?.slice(6);
const list = all
  .filter((c) => (!month || c.publishedAt.startsWith(month)) && (!src || src.split(",").includes(c.sourceId)))
  .sort((a, b) => a.publishedAt.localeCompare(b.publishedAt));
for (const c of list) {
  const line = `${used.has(c.id) ? "✓" : " "} ${c.id} ${c.publishedAt.slice(5, 10)} ${c.sourceId.padEnd(15)} ${c.title.slice(0, 110)}`;
  console.log(line);
  if (withDesc && c.description) console.log(`      ${c.description.slice(0, 300)}`);
}
console.log(`(${list.length})`);
