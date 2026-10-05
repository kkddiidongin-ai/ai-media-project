#!/usr/bin/env node
/**
 * 사용법
 *   node scripts/ingest/run.mjs --mode backfill --from 2026-01-01 [--to YYYY-MM-DD] [--only openai,anthropic]
 *   node scripts/ingest/run.mjs --mode incremental            (소스별 마지막 수집 3일 전부터 오늘까지)
 *
 * 결과
 *   ingest/candidates/YYYY-MM.json   정규화·중복 제거된 후보 (id = 정규 URL의 해시)
 *   ingest/state.json                소스별 마지막 수집 시각
 *   ingest/log/<run>.json            실행 기록 (어디서 몇 개를 찾았는지, 오류)
 *
 * 후보는 아직 기사가 아니다. 편집(사람/Claude)이 사실을 확인하고 새로 쓴 것만 content/stories에 들어간다.
 */
import path from "node:path";
import {
  LOG_DIR,
  REGISTRY_FILE,
  STATE_FILE,
  candidateId,
  canonicalUrl,
  isAiRelevant,
  isoDate,
  loadAllCandidates,
  parseFeed,
  parseMeta,
  parseSitemap,
  politeFetch,
  readJson,
  stripHtml,
  robotsAllowed,
  saveCandidates,
  today,
  writeJson,
} from "./lib.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith("--")) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith("--") ? arr[i + 1] : true]);
    return acc;
  }, []),
);
const mode = args.mode ?? "incremental";
const until = args.to ?? today();
const only = typeof args.only === "string" ? new Set(args.only.split(",")) : null;
const MAX_PAGED = Number(args.maxPages ?? 60);
const MAX_META = Number(args.maxMeta ?? 600);

const registry = readJson(REGISTRY_FILE, { sources: [] });
const state = readJson(STATE_FILE, { sources: {} });

function sinceFor(src) {
  if (mode === "backfill") return args.from ?? "2026-01-01";
  const last = state.sources[src.id]?.lastRunAt;
  if (!last) return args.from ?? "2026-01-01";
  const d = new Date(Date.parse(last) - 3 * 86400000); // 3일 겹쳐서 누락 방지 (중복은 id로 걸러짐)
  return d.toISOString().slice(0, 10);
}

const inRange = (iso, since) => iso && iso.slice(0, 10) >= since && iso.slice(0, 10) <= until;

async function fetchText(url, accept) {
  if (!(await robotsAllowed(url))) throw new Error(`robots.txt disallow: ${url}`);
  const r = await politeFetch(url, { accept });
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${url}`);
  return r.text();
}

async function collectRss(src, since, stats) {
  const text = await fetchText(src.feedUrl, "application/rss+xml, application/atom+xml, application/xml");
  stats.requests++;
  return parseFeed(text).map((i) => ({ ...i, discoveredVia: src.feedUrl }));
}

async function collectRssPaged(src, since, stats) {
  const out = [];
  for (let p = 1; p <= MAX_PAGED; p++) {
    const url = p === 1 ? src.feedUrl : `${src.feedUrl}${src.feedUrl.includes("?") ? "&" : "?"}paged=${p}`;
    let items;
    try {
      items = parseFeed(await fetchText(url, "application/rss+xml, application/xml"));
      stats.requests++;
    } catch (e) {
      if (p > 1 && /HTTP 404/.test(e.message)) break; // 마지막 페이지 다음
      throw e;
    }
    if (items.length === 0) break;
    out.push(...items.map((i) => ({ ...i, discoveredVia: url })));
    const oldest = items.map((i) => isoDate(i.date)).filter(Boolean).sort()[0];
    if (oldest && oldest.slice(0, 10) < since) break;
  }
  return out;
}

async function sitemapLocs(url, depth, stats) {
  const entries = parseSitemap(await fetchText(url, "application/xml"));
  stats.requests++;
  const urls = entries.filter((e) => e.kind === "url");
  if (depth >= 2) return urls;
  for (const child of entries.filter((e) => e.kind === "sitemap")) {
    try {
      urls.push(...(await sitemapLocs(child.loc, depth + 1, stats)));
    } catch (e) {
      stats.errors.push(e.message);
    }
  }
  return urls;
}

async function collectSitemapMeta(src, since, stats) {
  const include = new RegExp(src.include);
  const locs = (await sitemapLocs(src.feedUrl, 0, stats)).filter(
    // lastmod(마지막 수정) < since 이면 발행일도 since 이전이므로 건너뛴다
    (e) => include.test(e.loc) && (!e.lastmod || e.lastmod.slice(0, 10) >= since),
  );
  const uniq = [...new Map(locs.map((e) => [canonicalUrl(e.loc), e])).values()];
  const known = loadAllCandidates();
  const out = [];
  for (const e of uniq.slice(0, MAX_META)) {
    if (known.has(candidateId(e.loc))) {
      stats.skippedKnown++;
      continue; // 이미 후보에 있는 페이지는 다시 열지 않는다
    }
    try {
      const html = await fetchText(e.loc, "text/html");
      stats.requests++;
      const m = parseMeta(html);
      out.push({ title: m.title, url: e.loc, date: m.published ?? "", description: m.description, categories: [], discoveredVia: src.feedUrl });
    } catch (err) {
      stats.errors.push(err.message);
    }
  }
  if (uniq.length > MAX_META) stats.errors.push(`meta cap ${MAX_META} reached (${uniq.length} urls)`);
  return out;
}

/**
 * 날짜별 릴리스 노트 페이지 (예: docs.x.ai/developers/release-notes).
 * h2(월, id에 연도가 없으면 올해) → 날짜 표시 → h3(id = 항목 앵커) → 본문 문단 구조를 순서대로 읽는다.
 * 항목마다 `페이지#앵커`를 원문 주소로 쓰고, 설명은 첫 문단 일부만 남긴다.
 */
async function collectReleaseNotes(src, since, stats) {
  const html = await fetchText(src.feedUrl, "text/html");
  stats.requests++;
  const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  // <p> 본문은 h2·h3·날짜 라벨을 넘어가지 못하게 한다 (Phase 6.4: 내비게이션의 <p>가 다음 </p>까지 이어져
  // 첫 월 제목·가장 최신 항목을 통째로 삼키던 버그 수정)
  const tokenRe =
    /<h2[^>]*id="([^"]+)"[^>]*>|>((?:January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2})<span|<h3[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/h3>|<p[^>]*>((?:(?!<\/p>|<h[23][\s>]|<span aria-hidden)[\s\S])*?)<\/p>/g;
  const out = [];
  let year = new Date().getUTCFullYear();
  let day = null;
  let monthIdx = null;
  let cur = null;
  for (const m of html.matchAll(tokenRe)) {
    if (m[1]) {
      const y = m[1].match(/-(\d{4})$/);
      const month = m[1].replace(/-\d{4}$/, "");
      if (MONTHS.includes(month)) {
        year = y ? Number(y[1]) : new Date().getUTCFullYear();
        monthIdx = MONTHS.indexOf(month);
        day = null; // 일자 라벨은 같은 월 안에서만 유효 — 다음 월 항목이 이전 라벨을 물려받던 버그(Phase 6.4) 수정
      }
    } else if (m[2]) {
      day = m[2];
    } else if (m[3]) {
      if (cur) out.push(cur);
      // 일자 라벨이 없는 항목은 월까지만 안다 → 해당 월 1일 + datePrecision "month" (publish에서 사용 금지)
      const date = day ? new Date(`${day}, ${year} 00:00:00 UTC`) : monthIdx !== null ? new Date(Date.UTC(year, monthIdx, 1)) : null;
      cur = {
        title: stripHtml(m[4]),
        url: `${src.feedUrl}#${m[3]}`,
        idKey: `${src.feedUrl}?entry=${m[3]}`,
        date: date && !Number.isNaN(date.getTime()) ? date.toISOString() : "",
        description: "",
        categories: [],
        discoveredVia: src.feedUrl,
        ...(day ? {} : { datePrecision: "month" }),
      };
    } else if (m[5] && cur && cur.description.length < 500) {
      cur.description = `${cur.description} ${stripHtml(m[5])}`.trim();
    }
  }
  if (cur) out.push(cur);
  return out;
}

const collectors = { rss: collectRss, "rss-paged": collectRssPaged, "sitemap-meta": collectSitemapMeta, "release-notes": collectReleaseNotes };

async function main() {
  const startedAt = new Date().toISOString();
  const candidates = loadAllCandidates();
  const run = { runId: startedAt.replace(/[:.]/g, "").slice(0, 15), mode, until, startedAt, sources: [] };

  for (const src of registry.sources) {
    if (only && !only.has(src.id)) continue;
    if (!src.enabled || !collectors[src.fetchMode]) {
      run.sources.push({ id: src.id, skipped: src.note ?? "disabled" });
      continue;
    }
    const since = sinceFor(src);
    const stats = { id: src.id, since, requests: 0, found: 0, inRange: 0, irrelevant: 0, new: 0, duplicate: 0, skippedKnown: 0, errors: [] };
    try {
      const items = await collectors[src.fetchMode](src, since, stats);
      stats.found = items.length;
      for (const it of items) {
        const publishedAt = isoDate(it.date);
        if (!inRange(publishedAt, since)) continue;
        stats.inRange++;
        if (src.relevance === "ai" && !isAiRelevant(it)) {
          stats.irrelevant++;
          continue;
        }
        const id = candidateId(it.idKey ?? it.url);
        if (candidates.has(id)) {
          stats.duplicate++;
          continue;
        }
        candidates.set(id, {
          id,
          url: it.url,
          canonicalUrl: canonicalUrl(it.url),
          title: it.title,
          description: it.description.slice(0, 600),
          publishedAt,
          ...(it.datePrecision ? { datePrecision: it.datePrecision } : {}),
          sourceId: src.id,
          sourceName: src.name,
          sourceType: src.sourceType,
          tier: src.tier,
          fetchMode: src.fetchMode,
          discoveredVia: it.discoveredVia,
          discoveredAt: startedAt,
          runId: run.runId,
          status: "candidate",
        });
        stats.new++;
      }
      state.sources[src.id] = { lastRunAt: startedAt, lastMode: mode };
    } catch (e) {
      stats.errors.push(e.message);
    }
    run.sources.push(stats);
    console.log(
      `${src.id.padEnd(16)} since ${since} · req ${stats.requests} · found ${stats.found} · in range ${stats.inRange} · new ${stats.new} · dup ${stats.duplicate}${stats.errors.length ? ` · errors ${stats.errors.length}` : ""}`,
    );
  }

  saveCandidates(candidates);
  run.finishedAt = new Date().toISOString();
  run.totalCandidates = candidates.size;
  writeJson(STATE_FILE, state);
  writeJson(path.join(LOG_DIR, `${run.runId}-${mode}.json`), run);
  console.log(`\ncandidates total: ${candidates.size}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
