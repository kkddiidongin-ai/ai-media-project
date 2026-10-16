#!/usr/bin/env node
/**
 * 편집 승인된 원고를 발행 구조(DAILY_PUBLISHING.md §3)로 옮긴다 — 기본은 dry-run (아무것도 쓰지 않음)
 *
 *   npm run daily:apply-drafts -- <editorial-drafts.json>                 # dry-run: 만들 후보 기록·편집 항목만 보여 줌
 *   npm run daily:apply-drafts -- <editorial-drafts.json> --apply         # ingest/candidates · ingest/editorial에 추가
 *   … --only <slug,slug>                                                  # 일부 원고만
 *
 * 하는 일: 원고마다 (1) 후보 기록(원문 + 추가 출처) (2) 편집 항목을 만든다. content/stories는 건드리지 않는다
 *   — 기사 파일은 그다음 `npm run publish:daily`(publish:stories → QA → build)가 만든다. publishedAt은 그 실행일로 정해진다.
 * 멈추는 경우: verdict가 PUBLISHABLE이 아님 · daily:check-drafts FAIL · slug가 이미 편집 항목/기사에 있음 ·
 *   같은 후보 id가 다른 URL로 있음 · 분류/주제가 사이트 목록에 없음 · 발표일이 미래.
 * AIMAJUNG_ROOT를 주면 그 복사본에만 쓴다 (격리 시험용).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CANDIDATE_DIR, CATEGORIES, ROOT, candidateId, canonicalUrl, loadAllCandidates, readJson } from "../ingest/lib.mjs";
import { checkDraft } from "./check-editorial-drafts.mjs";
import { loadExisting } from "./lib.mjs";

const EDITORIAL_DIR = path.join(ROOT, "ingest", "editorial");

function editorialSlugs() {
  const out = new Set();
  if (!fs.existsSync(EDITORIAL_DIR)) return out;
  for (const f of fs.readdirSync(EDITORIAL_DIR).filter((x) => x.endsWith(".json"))) for (const d of readJson(path.join(EDITORIAL_DIR, f), [])) out.add(d.slug);
  return out;
}

const candidateFrom = (src, { runId, now, description }) => ({
  id: candidateId(src.sourceUrl),
  url: src.sourceUrl,
  canonicalUrl: canonicalUrl(src.sourceUrl),
  title: src.sourceTitle,
  description,
  publishedAt: new Date(src.sourcePublishedAt).toISOString(),
  sourceId: "manual",
  sourceName: src.sourceName,
  sourceType: src.sourceType,
  tier: 1,
  fetchMode: "manual",
  discoveredVia: runId,
  discoveredAt: now,
  runId,
  status: "candidate",
});

/**
 * @returns {{ ok: boolean, problems: string[], candidates: object[], editorial: object[], plan: string[] }}
 */
export function buildPackage(doc, { only = null, runId, now = new Date().toISOString(), existing = loadExisting(), today = now.slice(0, 10) } = {}) {
  const problems = [];
  const candidates = [];
  const editorial = [];
  const plan = [];
  const known = loadAllCandidates();
  const taken = editorialSlugs();
  const topics = new Set(readJson(path.join(ROOT, "content", "topics.json"), []).map((t) => t.slug));
  for (const d of doc.drafts) {
    const s = d.story;
    if (only && !only.includes(s.slug)) continue;
    const where = s.slug;
    if (d.verdict !== "PUBLISHABLE") {
      problems.push(`${where}: 판정 ${d.verdict ?? "없음"} — PUBLISHABLE만 발행 구조로 옮긴다`);
      continue;
    }
    const qa = checkDraft(d, existing);
    if (qa.verdict === "FAIL") problems.push(`${where}: 원고 점검 FAIL — ${qa.fail.join(" · ")}`);
    if (taken.has(s.slug)) problems.push(`${where}: 편집 항목에 같은 slug가 이미 있음`);
    if (existing.stories.some((x) => x.slug === s.slug)) problems.push(`${where}: 같은 slug의 기사가 이미 있음`);
    if (!CATEGORIES.includes(s.category)) problems.push(`${where}: 분류 ${s.category}가 목록에 없음`);
    for (const t of s.topics) if (!topics.has(t)) problems.push(`${where}: 주제 ${t}가 content/topics.json에 없음`);
    if (s.eventDate > today) problems.push(`${where}: 발표일 ${s.eventDate}가 미래`);
    const primary = { sourceUrl: s.sourceUrl, sourceTitle: s.sourceTitle, sourceName: s.sourceName, sourceType: s.sourceType, sourcePublishedAt: s.sourcePublishedAt };
    const ids = [];
    for (const [i, src] of [primary, ...(s.secondarySources ?? [])].entries()) {
      const c = candidateFrom(src, { runId, now, description: i === 0 ? s.summary : `${s.title} — 추가 출처` });
      const prev = known.get(c.id) ?? candidates.find((x) => x.id === c.id);
      if (prev && canonicalUrl(prev.url) !== c.canonicalUrl) problems.push(`${where}: 후보 id ${c.id}가 다른 URL(${prev.url})로 이미 있음`);
      else if (prev) plan.push(`${where}: 후보 ${c.id} 이미 있음 — 다시 쓰지 않음 (${c.url})`);
      else {
        candidates.push(c);
        plan.push(`${where}: 후보 추가 ${c.id} ${c.publishedAt.slice(0, 10)} ${c.url}`);
      }
      ids.push(c.id);
    }
    const entry = {
      c: ids[0],
      slug: s.slug,
      title: s.title,
      summary: s.summary,
      cat: s.category,
      topics: s.topics,
      companies: s.companies,
      products: s.products,
      facts: s.facts,
      why: s.whyItMatters,
      change: s.whatChanges,
      prio: s.priority,
      ...(ids.length > 1 ? { secondary: ids.slice(1) } : {}),
      editorialDepth: String(s.editorialDepth).toUpperCase(),
      eventDate: s.eventDate,
    };
    editorial.push(entry);
    plan.push(`${where}: 편집 항목 추가 → ingest/editorial/${s.eventDate.slice(0, 7)}.json (발표일 ${s.eventDate}, 깊이 ${entry.editorialDepth})`);
  }
  return { ok: problems.length === 0, problems, candidates, editorial, plan };
}

/** 후보 기록 · 편집 항목을 월별 파일에 추가한다 (기존 항목은 그대로) */
export function writePackage(pkg) {
  const written = [];
  const byMonth = (list, key) => list.reduce((m, x) => m.set(key(x), [...(m.get(key(x)) ?? []), x]), new Map());
  for (const [month, list] of byMonth(pkg.candidates, (c) => c.publishedAt.slice(0, 7))) {
    const file = path.join(CANDIDATE_DIR, `${month}.json`);
    const cur = readJson(file, []);
    const next = [...cur, ...list].sort((a, b) => a.publishedAt.localeCompare(b.publishedAt) || a.id.localeCompare(b.id));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(next, null, 2) + "\n");
    written.push(path.relative(ROOT, file));
  }
  for (const [month, list] of byMonth(pkg.editorial, (e) => e.eventDate.slice(0, 7))) {
    const file = path.join(EDITORIAL_DIR, `${month}.json`);
    const cur = readJson(file, []);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify([...cur, ...list], null, 2) + "\n");
    written.push(path.relative(ROOT, file));
  }
  return written;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const file = argv.find((a) => !a.startsWith("--") && argv[argv.indexOf(a) - 1] !== "--only");
  const onlyI = argv.indexOf("--only");
  const only = onlyI >= 0 ? argv[onlyI + 1].split(",") : null;
  if (!file || !fs.existsSync(file)) {
    console.error("사용법: npm run daily:apply-drafts -- <editorial-drafts.json> [--only slug,slug] [--apply]");
    process.exit(1);
  }
  const doc = JSON.parse(fs.readFileSync(file, "utf8"));
  const runId = path.basename(path.dirname(path.dirname(path.resolve(file))));
  const pkg = buildPackage(doc, { only, runId });
  console.log(`대상 ${ROOT}`);
  for (const p of pkg.plan) console.log(`  ${p}`);
  if (!pkg.ok) {
    console.error("멈춤 — 아무것도 쓰지 않았습니다:\n- " + pkg.problems.join("\n- "));
    process.exit(1);
  }
  if (!argv.includes("--apply")) {
    console.log(`dry-run — 후보 ${pkg.candidates.length}건 · 편집 항목 ${pkg.editorial.length}건을 추가할 예정 (아무것도 쓰지 않음). 실제 반영은 --apply`);
  } else {
    const written = writePackage(pkg);
    console.log(`반영 완료: ${written.join(", ")} — 다음: npm run publish:daily`);
  }
}
