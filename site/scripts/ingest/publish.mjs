#!/usr/bin/env node
/**
 * Editorial Summary → Publish
 *
 *   node scripts/ingest/publish.mjs
 *
 * ingest/editorial/YYYY-MM.json(편집자가 새로 쓴 글) + ingest/candidates(출처 기록)를 합쳐
 * content/stories/YYYY-MM.json(사이트가 읽는 로컬 DB)을 만든다.
 *
 * - 출처 정보(sourceName/Url/PublishedAt/Title)는 손으로 쓰지 않고 후보 기록에서 가져온다 (출처 추적).
 * - publishedAt(이 사이트 발행일)은 처음 발행할 때 한 번 정해지고, 다시 실행해도 바뀌지 않는다.
 * - 형식이 틀리면 아무것도 쓰지 않고 멈춘다.
 */
import fs from "node:fs";
import path from "node:path";
import { ROOT, loadAllCandidates, readJson, today, writeJson } from "./lib.mjs";

const EDITORIAL_DIR = path.join(ROOT, "ingest", "editorial");
/** 심층 기사(Phase 6.4.1 Editorial Depth Pilot): ingest/editorial/deep/<slug>.json — 해당 기사에만 덧붙는다 */
const DEEP_DIR = path.join(EDITORIAL_DIR, "deep");
const SECTION_ROLES = ["what", "before", "change", "point", "users", "open"];
const STORY_DIR = path.join(ROOT, "content", "stories");
export const CATEGORIES = [
  "MODEL_RELEASE", "PRODUCT_UPDATE", "AI_AGENT", "AI_CODING", "AI_SEARCH", "IMAGE", "VIDEO", "VOICE", "ROBOTICS",
  "CHIPS_INFRA", "BUSINESS", "INVESTMENT", "REGULATION", "COPYRIGHT", "RESEARCH", "BENCHMARK", "SECURITY", "WORK", "CONSUMER",
];

const candidates = loadAllCandidates();
const topics = new Set(readJson(path.join(ROOT, "content", "topics.json"), []).map((t) => t.slug));
const existing = new Map();
if (fs.existsSync(STORY_DIR)) {
  for (const f of fs.readdirSync(STORY_DIR).filter((f) => f.endsWith(".json")))
    for (const s of readJson(path.join(STORY_DIR, f), [])) existing.set(s.slug, s);
}

const errors = [];
const slugs = new Set();
const usedCandidates = new Map();
const stories = [];
const now = today();

const deepBySlug = new Map();
if (fs.existsSync(DEEP_DIR)) {
  for (const f of fs.readdirSync(DEEP_DIR).filter((f) => f.endsWith(".json"))) {
    const d = readJson(path.join(DEEP_DIR, f), null);
    const where = `deep/${f}`;
    if (!d?.slug || `${d.slug}.json` !== f) {
      errors.push(`${where}: slug와 파일 이름이 같아야 함`);
      continue;
    }
    if (!d.lead || d.lead.length < 40) errors.push(`${where}: lead(2~3문장) 필요`);
    if (!Array.isArray(d.sections) || d.sections.length < 4) errors.push(`${where}: sections 4개 이상 필요`);
    for (const [i, sec] of (d.sections ?? []).entries()) {
      if (!SECTION_ROLES.includes(sec.role)) errors.push(`${where}: sections[${i}].role ${sec.role}`);
      if (!sec.heading) errors.push(`${where}: sections[${i}].heading 필요`);
      if (!(sec.paragraphs?.length || sec.bullets?.length)) errors.push(`${where}: sections[${i}] 본문 없음`);
    }
    for (const role of ["what", "users", "open"]) if (!(d.sections ?? []).some((x) => x.role === role)) errors.push(`${where}: '${role}' 역할 섹션 필요`);
    if (d.facts && (d.facts.length < 3 || d.facts.length > 5)) errors.push(`${where}: facts는 3~5개`);
    for (const r of d.references ?? []) {
      if (!/^https?:\/\//.test(r.sourceUrl ?? "")) errors.push(`${where}: reference URL 형식`);
      if (!r.sourceName || !r.sourceTitle || !/^\d{4}-\d{2}-\d{2}$/.test(r.checkedAt ?? "")) errors.push(`${where}: reference 이름·제목·확인일 필요`);
    }
    deepBySlug.set(d.slug, d);
  }
}

const req = (file, d, k) => {
  if (d[k] === undefined || d[k] === null || d[k] === "" || (Array.isArray(d[k]) && d[k].length === 0)) errors.push(`${file} ${d.slug ?? d.c}: "${k}" 필요`);
};

const sourceOf = (c) => ({
  candidateId: c.id,
  sourceType: c.sourceType,
  sourceName: c.sourceName,
  sourceUrl: c.url,
  sourcePublishedAt: c.publishedAt,
  sourceTitle: c.title,
});

for (const file of fs.readdirSync(EDITORIAL_DIR).filter((f) => f.endsWith(".json")).sort()) {
  for (const d of readJson(path.join(EDITORIAL_DIR, file), [])) {
    for (const k of ["c", "slug", "title", "summary", "cat", "topics", "facts", "why", "change"]) req(file, d, k);
    const c = candidates.get(d.c);
    if (!c) {
      errors.push(`${file} ${d.slug}: 후보 ${d.c} 없음`);
      continue;
    }
    if (c.datePrecision === "month") errors.push(`${file} ${d.slug}: 후보 ${d.c}는 일자 미상(월 단위) — 날짜를 지어낼 수 없으므로 발행 불가`);
    if (!/^[a-z0-9-]+$/.test(d.slug ?? "")) errors.push(`${file} ${d.slug}: slug 형식`);
    if (slugs.has(d.slug)) errors.push(`${file}: slug 중복 ${d.slug}`);
    slugs.add(d.slug);
    if (usedCandidates.has(d.c)) errors.push(`${file} ${d.slug}: 후보 ${d.c}가 ${usedCandidates.get(d.c)}에도 쓰임 (같은 사건 중복)`);
    usedCandidates.set(d.c, d.slug);
    if (!CATEGORIES.includes(d.cat)) errors.push(`${file} ${d.slug}: category ${d.cat}`);
    for (const t of d.topics ?? []) if (!topics.has(t)) errors.push(`${file} ${d.slug}: topic ${t} 없음 (content/topics.json)`);
    const secondary = [];
    for (const sid of d.secondary ?? []) {
      const sc = candidates.get(sid);
      if (!sc) errors.push(`${file} ${d.slug}: secondary 후보 ${sid} 없음`);
      else if (sc.url === c.url) errors.push(`${file} ${d.slug}: secondary가 primary와 같은 URL`);
      else secondary.push(sourceOf(sc));
    }
    const eventDate = d.eventDate ?? c.publishedAt.slice(0, 10);
    if (eventDate > now) errors.push(`${file} ${d.slug}: eventDate가 미래 ${eventDate}`);
    const prev = existing.get(d.slug);
    const body = {
      title: d.title, summary: d.summary, category: d.cat, topics: d.topics, companies: d.companies ?? [], products: d.products ?? [],
      facts: d.facts, whyItMatters: d.why, whatChanges: d.change, priority: d.prio ?? 3, secondarySources: secondary,
    };
    const deep = deepBySlug.get(d.slug);
    // 편집자가 정한 등급(선택): "DEEP" | "STANDARD" | "SHORT". DEEP은 deep/<slug>.json이 있어야만 인정한다
    if (d.editorialDepth !== undefined) {
      if (!["DEEP", "STANDARD", "SHORT"].includes(d.editorialDepth)) errors.push(`${file} ${d.slug}: editorialDepth는 DEEP·STANDARD·SHORT 중 하나 (${d.editorialDepth})`);
      else if ((d.editorialDepth === "DEEP") !== !!deep)
        errors.push(`${file} ${d.slug}: editorialDepth ${d.editorialDepth}인데 deep/${d.slug}.json이 ${deep ? "있음" : "없음"}`);
    }
    if (deep) {
      deepBySlug.delete(d.slug);
      const known = new Set([c.url, ...secondary.map((x) => x.sourceUrl)]);
      for (const r of deep.references ?? []) if (known.has(r.sourceUrl)) errors.push(`deep/${d.slug}.json: reference ${r.sourceUrl}는 이미 원문·추가 출처에 있음`);
      Object.assign(body, {
        ...(deep.facts ? { facts: deep.facts } : {}),
        editorialDepth: "deep",
        lead: deep.lead,
        sections: deep.sections.map((x) => ({ role: x.role, heading: x.heading, paragraphs: x.paragraphs ?? [], bullets: x.bullets ?? [] })),
        references: (deep.references ?? []).map((r) => ({
          sourceName: r.sourceName,
          sourceTitle: r.sourceTitle,
          sourceUrl: r.sourceUrl,
          sourcePublishedAt: r.sourcePublishedAt ?? "",
          checkedAt: r.checkedAt,
          note: r.note ?? "",
        })),
      });
    }
    const changed = !prev || JSON.stringify(Object.fromEntries(Object.keys(body).map((k) => [k, prev[k]]))) !== JSON.stringify(body);
    // 내부 분류(화면 노출 없음). 비교 뒤에 붙여 등급 표시만으로 updatedAt이 바뀌지 않게 한다
    // short: 우선순위 3·사실 1개·추가 출처 없음인 단신 / standard: 그 밖의 일반 기사
    // 명시값이 있으면 그대로, 없으면(과거 데이터) 기존 자동 판정
    if (!deep)
      body.editorialDepth = ["STANDARD", "SHORT"].includes(d.editorialDepth)
        ? d.editorialDepth.toLowerCase()
        : body.priority === 3 && body.facts.length === 1 && secondary.length === 0 ? "short" : "standard";
    stories.push({
      id: `s-${eventDate.replace(/-/g, "")}-${c.id.slice(0, 6)}`,
      slug: d.slug,
      ...body,
      eventDate,
      publishedAt: prev?.publishedAt ?? now,
      updatedAt: changed ? now : (prev?.updatedAt ?? now),
      ...sourceOf(c),
      contentType: "NEWS",
      status: "published",
      backfilled: prev?.backfilled ?? eventDate < now,
      collectedAt: c.discoveredAt,
      provenance: {
        discoveredVia: c.discoveredVia,
        fetchMode: c.fetchMode,
        runId: c.runId,
        verification: secondary.length ? "primary+secondary" : c.sourceType === "official" ? "primary-official" : "press-only",
      },
    });
  }
}

for (const slug of deepBySlug.keys()) errors.push(`deep/${slug}.json: 해당 slug의 기사가 없음`);
if (errors.length) {
  console.error(errors.join("\n"));
  console.error(`\n${errors.length}개 오류 — 아무것도 쓰지 않았습니다.`);
  process.exit(1);
}

const byMonth = new Map();
for (const s of stories) {
  const k = s.eventDate.slice(0, 7);
  if (!byMonth.has(k)) byMonth.set(k, []);
  byMonth.get(k).push(s);
}
fs.mkdirSync(STORY_DIR, { recursive: true });
for (const f of fs.readdirSync(STORY_DIR).filter((f) => f.endsWith(".json"))) fs.rmSync(path.join(STORY_DIR, f));
for (const [k, list] of byMonth) {
  list.sort((a, b) => b.eventDate.localeCompare(a.eventDate) || a.priority - b.priority || a.slug.localeCompare(b.slug));
  writeJson(path.join(STORY_DIR, `${k}.json`), list);
}
console.log(`published ${stories.length} stories (${[...byMonth].map(([k, v]) => `${k}:${v.length}`).join(" ")})`);
