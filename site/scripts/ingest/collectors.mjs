/**
 * 소스별 수집기 (run.mjs의 ingest:news와 scripts/daily의 매일 수집이 함께 쓴다)
 *
 * Phase 7.1에서 run.mjs 안에 있던 함수를 그대로 옮겼다. 바뀐 점은 상한·이미 아는 후보를 opts로 받는 것뿐이다.
 *   collector(src, since, stats, { maxPaged, maxMeta, known })
 * - robots.txt가 막은 주소는 요청하지 않는다 (fetchText).
 * - 페이지 본문은 저장하지 않고 제목·설명·발행일 메타만 읽는다.
 */
import { canonicalUrl, candidateId, isoDate, loadAllCandidates, parseFeed, parseMeta, parseSitemap, politeFetch, robotsAllowed, stripHtml } from "./lib.mjs";

export async function fetchText(url, accept) {
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

async function collectRssPaged(src, since, stats, opts = {}) {
  const maxPaged = opts.maxPaged ?? 60;
  const out = [];
  for (let p = 1; p <= maxPaged; p++) {
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

async function collectSitemapMeta(src, since, stats, opts = {}) {
  const maxMeta = opts.maxMeta ?? 600;
  const include = new RegExp(src.include);
  const locs = (await sitemapLocs(src.feedUrl, 0, stats)).filter(
    // lastmod(마지막 수정) < since 이면 발행일도 since 이전이므로 건너뛴다
    (e) => include.test(e.loc) && (!e.lastmod || e.lastmod.slice(0, 10) >= since),
  );
  const uniq = [...new Map(locs.map((e) => [canonicalUrl(e.loc), e])).values()];
  const known = opts.known ?? loadAllCandidates();
  const out = [];
  for (const e of uniq.slice(0, maxMeta)) {
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
  if (uniq.length > maxMeta) stats.errors.push(`meta cap ${maxMeta} reached (${uniq.length} urls)`);
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

export const collectors = { rss: collectRss, "rss-paged": collectRssPaged, "sitemap-meta": collectSitemapMeta, "release-notes": collectReleaseNotes };
