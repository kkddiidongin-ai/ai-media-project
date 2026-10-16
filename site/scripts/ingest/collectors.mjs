/**
 * 소스별 수집기 (run.mjs의 ingest:news와 scripts/daily의 매일 수집이 함께 쓴다)
 *
 * Phase 7.1에서 run.mjs 안에 있던 함수를 그대로 옮겼다. 바뀐 점은 상한·이미 아는 후보를 opts로 받는 것뿐이다.
 *   collector(src, since, stats, { maxPaged, maxMeta, known })
 * - robots.txt가 막은 주소는 요청하지 않는다 (fetchText).
 * - 페이지 본문은 저장하지 않고 제목·설명·발행일 메타만 읽는다.
 */
import { canonicalUrl, candidateId, isoDate, loadAllCandidates, parseFeed, parseMeta, parseSitemap, politeFetch, robotsAllowed, stripHtml } from "./lib.mjs";

/**
 * @param {object} [http] 넘기면 응답 정보(HTTP 상태 · 리다이렉트 · 최종 주소)를 적는다 (소스 상태 기록용, Phase 7.1.5)
 */
export async function fetchText(url, accept, http = null) {
  if (!(await robotsAllowed(url))) throw new Error(`robots.txt disallow: ${url}`);
  const r = await politeFetch(url, { accept });
  if (http) Object.assign(http, { status: r.status, redirected: Boolean(r.redirected), finalUrl: r.redirected && r.url ? r.url : null });
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${url}`);
  return r.text();
}
/** 첫 요청(목록·피드·사이트맵)의 응답 정보를 담을 곳 */
const httpOf = (stats) => (stats.http ??= {});

async function collectRss(src, since, stats) {
  const text = await fetchText(src.feedUrl, "application/rss+xml, application/atom+xml, application/xml", httpOf(stats));
  stats.requests++;
  const items = parseFeed(text);
  stats.parsed = stats.matched = items.length;
  return items.map((i) => ({ ...i, discoveredVia: src.feedUrl }));
}

async function collectRssPaged(src, since, stats, opts = {}) {
  const maxPaged = opts.maxPaged ?? 60;
  const out = [];
  for (let p = 1; p <= maxPaged; p++) {
    const url = p === 1 ? src.feedUrl : `${src.feedUrl}${src.feedUrl.includes("?") ? "&" : "?"}paged=${p}`;
    let items;
    try {
      items = parseFeed(await fetchText(url, "application/rss+xml, application/xml", p === 1 ? httpOf(stats) : null));
      stats.requests++;
      stats.parsed = stats.matched = (stats.parsed ?? 0) + items.length;
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
  const entries = parseSitemap(await fetchText(url, "application/xml", depth === 0 ? httpOf(stats) : null));
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
  const all = await sitemapLocs(src.feedUrl, 0, stats);
  const matched = all.filter((e) => include.test(e.loc));
  // parsed: 사이트맵 주소 전체 · matched: 이 소스의 글 주소 형식에 맞는 주소 (0이면 구조가 바뀐 것 — 기간과 무관)
  stats.parsed = all.length;
  stats.matched = matched.length;
  // lastmod(마지막 수정) < since 이면 발행일도 since 이전이므로 건너뛴다
  const locs = matched.filter((e) => !e.lastmod || e.lastmod.slice(0, 10) >= since);
  // 상한(maxMeta) 안에 최신 글이 들어가도록 lastmod 최신순으로 (사이트맵 순서는 날짜순이 아니다 — 2026-10-12 Mistral에서 확인)
  const uniq = [...new Map(locs.map((e) => [canonicalUrl(e.loc), e])).values()].sort((a, b) => String(b.lastmod ?? "").localeCompare(String(a.lastmod ?? "")));
  return metaFor(uniq, src, stats, { ...opts, maxMeta });
}

/** 글 주소 목록 → 각 페이지 메타(제목·설명·발행일). 발행일 메타가 없으면 날짜를 비워 둔다 (임의 날짜 금지) */
async function metaFor(uniq, src, stats, opts) {
  const maxMeta = opts.maxMeta ?? 600;
  const known = opts.known ?? loadAllCandidates();
  const out = [];
  // 지난 실행에서 배치를 넘겨 남겨 둔 주소부터 (Phase 7.2: 상한 때문에 버리지 않고 이월)
  const carried = (opts.pending ?? []).filter((e) => e?.loc);
  const seen = new Set();
  const todo = [];
  for (const e of [...carried, ...uniq]) {
    const k = canonicalUrl(e.loc);
    if (seen.has(k)) continue;
    seen.add(k);
    if (known.has(candidateId(e.loc))) {
      stats.skippedKnown++;
      continue; // 이미 후보에 있는 페이지는 다시 열지 않는다
    }
    todo.push(e);
  }
  // 배치 크기만큼만 열고, 나머지는 다음 실행으로 넘긴다 (요청 수 제한 — 건수 제한이 아님)
  stats.pendingMeta = todo.slice(maxMeta).map((e) => ({ loc: e.loc, lastmod: e.lastmod ?? "" }));
  stats.carriedMeta = carried.length;
  for (const e of todo.slice(0, maxMeta)) {
    try {
      const html = await fetchText(e.loc, "text/html");
      stats.requests++;
      const m = parseMeta(html);
      // 메타에 발행일이 없고 소스가 허용한 경우에만: 본문에 보이는 날짜가 하나뿐일 때 그 날짜 (편집자 확인 표시)
      const textDate = !m.published && src.pageDateFallback ? singleVisibleDate(html) : null;
      const date = m.published ?? textDate ?? "";
      out.push({ title: m.title, url: e.loc, date, description: m.description, categories: [], discoveredVia: src.feedUrl, ...(textDate ? { dateSource: "page-text" } : {}), ...(date ? {} : { undated: true }) });
    } catch (err) {
      stats.errors.push(err.message);
    }
  }
  return out;
}

const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/**
 * 페이지 본문에 보이는 'October 7, 2026' 형식 날짜가 정확히 한 가지일 때만 그 날짜 (UTC 자정). 없거나 여러 가지면 null.
 * 발행일 메타가 없는 공식 발표 페이지(예: anthropic.com/claude-haiku-5-5)용. 날짜를 지어내지 않는다.
 */
export function singleVisibleDate(html) {
  const text = stripHtml(String(html).replace(/<(script|style)[\s\S]*?<\/\1>/gi, " "));
  const found = new Set();
  const re = new RegExp(String.raw`\b(${MONTHS_EN.join("|")}) (\d{1,2}), (20\d{2})\b`, "g");
  for (const m of text.matchAll(re)) {
    const d = new Date(Date.UTC(Number(m[3]), MONTHS_EN.indexOf(m[1]), Number(m[2])));
    if (d.getUTCDate() === Number(m[2])) found.add(d.toISOString());
  }
  return found.size === 1 ? [...found][0] : null;
}

/**
 * 목록 페이지(예: claude.com/resources/articles)의 글 링크 → 각 글 메타 (Phase 7.1.5)
 * 사이트맵에 lastmod가 없어 최신 글을 고를 수 없는 소스용. 목록 페이지는 최신 글이 위에 오므로 페이지 순서대로 본다.
 * 발행일은 각 글 페이지의 메타(article:published_time · datePublished)에서만 읽는다. 없으면 날짜를 비워 둔다.
 */
async function collectListingMeta(src, since, stats, opts = {}) {
  const html = await fetchText(src.feedUrl, "text/html", httpOf(stats));
  stats.requests++;
  const include = new RegExp(src.include);
  const hrefs = [...html.matchAll(/href=["']([^"'#?]+)["']/gi)].map((m) => {
    try {
      return new URL(m[1], src.feedUrl).toString();
    } catch {
      return null;
    }
  });
  stats.parsed = hrefs.filter(Boolean).length;
  const links = [...new Map(hrefs.filter((u) => u && include.test(u)).map((u) => [canonicalUrl(u), { loc: u }])).values()];
  stats.matched = links.length;
  return metaFor(links, src, stats, opts);
}

/**
 * 날짜별 릴리스 노트 페이지 (예: docs.x.ai/developers/release-notes).
 * h2(월, id에 연도가 없으면 올해) → 날짜 표시 → h3(id = 항목 앵커) → 본문 문단 구조를 순서대로 읽는다.
 * 항목마다 `페이지#앵커`를 원문 주소로 쓰고, 설명은 첫 문단 일부만 남긴다.
 */
async function collectReleaseNotes(src, since, stats) {
  const html = await fetchText(src.feedUrl, "text/html", httpOf(stats));
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
  stats.parsed = stats.matched = out.length;
  return out;
}

export const collectors = { rss: collectRss, "rss-paged": collectRssPaged, "sitemap-meta": collectSitemapMeta, "listing-meta": collectListingMeta, "release-notes": collectReleaseNotes };
