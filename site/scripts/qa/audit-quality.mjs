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
import { audit } from "./quality-rules.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "../..");
const stories = [];
for (const f of fs.readdirSync(path.join(ROOT, "content/stories")).filter((f) => f.endsWith(".json")))
  stories.push(...JSON.parse(fs.readFileSync(path.join(ROOT, "content/stories", f), "utf8")));

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
