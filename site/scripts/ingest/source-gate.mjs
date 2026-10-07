#!/usr/bin/env node
/**
 * Source Sufficiency Gate (Phase 6.4.2)
 *   node scripts/ingest/source-gate.mjs <noteDir> [--slugs a,b,c] [--min-priority 2]
 *
 * 심층(DEEP) 후보 기사의 원문·추가 출처를 다시 읽어, 심층 설명을 쓸 만큼 검증 가능한 공식 자료가 있는지 판정한다.
 * - robots.txt(일반·AI 크롤러 그룹)가 막으면 요청하지 않는다.
 * - 403·429·시간 초과는 우회하지 않는다. 같은 호스트에서 두 번 실패하면 그 호스트는 더 요청하지 않는다.
 * - 본문 텍스트는 편집자가 읽을 메모로만 <noteDir>에 저장한다(사이트에 옮기지 않음).
 *
 * 판정 (공식 출처에서 읽어낸 본문 글자 수 기준, 공백 제외):
 *   PASS    : 합계 2,500자 이상 + 그중 한 출처가 1,200자 이상
 *   LIMITED : 합계 600자 이상 (핵심 사실은 있으나 깊은 설명에는 부족)
 *   FAIL    : 그 미만 (짧은 발표·메타데이터뿐이거나 접근 불가)
 * 판정은 '쓸 수 있는가'의 하한일 뿐, DEEP 여부는 편집자가 독자 가치·중복을 함께 보고 정한다.
 * 결과: ingest/log/source-gate-YYYY-MM-DD.json
 */
import fs from "node:fs";
import path from "node:path";
import { ROOT, bodyText, politeFetch, robotsAllowed, today } from "./lib.mjs";

const args = process.argv.slice(2);
const noteDir = args[0];
if (!noteDir) {
  console.error("usage: node scripts/ingest/source-gate.mjs <noteDir> [--slugs a,b] [--min-priority 2]");
  process.exit(1);
}
const opt = (k) => {
  const i = args.indexOf(k);
  return i > 0 ? args[i + 1] : undefined;
};
const onlySlugs = opt("--slugs")?.split(",");
const maxPriority = Number(opt("--min-priority") ?? 2);
fs.mkdirSync(noteDir, { recursive: true });

const stories = [];
for (const f of fs.readdirSync(path.join(ROOT, "content/stories"))) stories.push(...JSON.parse(fs.readFileSync(path.join(ROOT, "content/stories", f), "utf8")));
const targets = stories.filter((s) => (onlySlugs ? onlySlugs.includes(s.slug) : s.priority <= maxPriority && s.editorialDepth !== "deep"));

const hostFails = new Map();
const results = {};
const jobs = [];
for (const s of targets) {
  const srcs = [{ kind: "primary", url: s.sourceUrl, type: s.sourceType }, ...s.secondarySources.map((x) => ({ kind: "secondary", url: x.sourceUrl, type: x.sourceType }))];
  results[s.slug] = { slug: s.slug, eventDate: s.eventDate, priority: s.priority, category: s.category, sources: [] };
  for (const src of srcs) jobs.push({ slug: s.slug, ...src });
}

const byHost = new Map();
for (const j of jobs) {
  const h = new URL(j.url).host;
  if (!byHost.has(h)) byHost.set(h, []);
  byHost.get(h).push(j);
}

let done = 0;
async function worker(list) {
  for (const j of list) {
    const h = new URL(j.url).host;
    const rec = { kind: j.kind, url: j.url, type: j.type, status: "", chars: 0, note: "" };
    if ((hostFails.get(h) ?? 0) >= 2) {
      rec.status = "SKIPPED-HOST-BLOCKED";
    } else if (!(await robotsAllowed(j.url))) {
      rec.status = "ROBOTS-BLOCKED";
    } else {
      try {
        const r = await politeFetch(j.url.split("#")[0], { delay: 1200, accept: "text/html" });
        if (!r.ok) {
          rec.status = `HTTP ${r.status}`;
          await r.body?.cancel();
          if (r.status === 403 || r.status === 429) hostFails.set(h, (hostFails.get(h) ?? 0) + 1);
        } else {
          const text = bodyText(await r.text());
          rec.status = "OK";
          rec.chars = text.replace(/\s/g, "").length;
          rec.note = `${j.slug}--${j.kind}--${h.replace(/[^a-z0-9]+/gi, "_")}.txt`;
          fs.writeFileSync(path.join(noteDir, rec.note), `URL: ${j.url}\nFETCHED: ${new Date().toISOString()}\n\n${text}\n`);
        }
      } catch (e) {
        rec.status = e.name === "TimeoutError" ? "TIMEOUT" : "NETWORK";
        hostFails.set(h, (hostFails.get(h) ?? 0) + 1);
      }
    }
    results[j.slug].sources.push(rec);
    if (++done % 25 === 0) console.error(`… ${done}/${jobs.length}`);
  }
}
await Promise.all([...byHost.values()].map(worker));

const counts = { PASS: 0, LIMITED: 0, FAIL: 0 };
for (const r of Object.values(results)) {
  const ok = r.sources.filter((x) => x.status === "OK" && x.type === "official");
  const total = ok.reduce((n, x) => n + x.chars, 0);
  const best = Math.max(0, ...ok.map((x) => x.chars));
  r.officialChars = total;
  r.gate = total >= 2500 && best >= 1200 ? "PASS" : total >= 600 ? "LIMITED" : "FAIL";
  counts[r.gate]++;
}
fs.mkdirSync(path.join(ROOT, "ingest/log"), { recursive: true });
const out = path.join(ROOT, "ingest/log", `source-gate-${today()}.json`);
const prev = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, "utf8")) : { results: {} };
fs.writeFileSync(out, JSON.stringify({ checkedAt: new Date().toISOString(), results: { ...prev.results, ...results } }, null, 2));
console.log(`targets ${targets.length} · requests ${jobs.length} · PASS ${counts.PASS} · LIMITED ${counts.LIMITED} · FAIL ${counts.FAIL}`);
console.log(`blocked hosts: ${[...hostFails].filter(([, n]) => n >= 2).map(([h]) => h).join(", ") || "-"}`);
console.log(`→ ${path.relative(ROOT, out)}`);
