/**
 * AI MEDIA ingestion library (Phase 6.3)
 *
 * Source Registry → Fetch → Normalize → Deduplicate → Candidate
 *
 * - build(next build)와 완전히 분리되어 있다. 이 스크립트만 외부에 접속한다.
 * - robots.txt를 먼저 확인하고, 일반 크롤러(*) 또는 AI 크롤러(anthropic-ai, ClaudeBot 등)를 막은 경로는 가져오지 않는다.
 * - 본문을 저장·재게시하지 않는다. 제목·링크·날짜·짧은 설명(피드/메타의 description)만 후보 기록에 남긴다.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "../..");
export const INGEST_DIR = path.join(ROOT, "ingest");
export const CANDIDATE_DIR = path.join(INGEST_DIR, "candidates");
export const LOG_DIR = path.join(INGEST_DIR, "log");
export const STATE_FILE = path.join(INGEST_DIR, "state.json");
export const REGISTRY_FILE = path.join(INGEST_DIR, "registry.json");

export const UA = "AIMediaResearchBot/0.1 (+https://example.com/method/; research, respects robots.txt)";
const AI_AGENTS = ["anthropic-ai", "claudebot", "claude-web", "claude-user", "claude-searchbot"];

export const today = () => new Date().toISOString().slice(0, 10);

export function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

export function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- fetch (호스트별 간격 유지) ----------

const lastHit = new Map();
export async function politeFetch(url, { delay = 500, accept = "*/*" } = {}) {
  const host = new URL(url).host;
  const wait = (lastHit.get(host) ?? 0) + delay - Date.now();
  if (wait > 0) await sleep(wait);
  lastHit.set(host, Date.now());
  const res = await fetch(url, {
    headers: { "user-agent": UA, accept },
    redirect: "follow",
    signal: AbortSignal.timeout(30000),
  });
  return res;
}

// ---------- robots.txt ----------

const robotsCache = new Map();

function parseRobots(txt) {
  const groups = [];
  let cur = null;
  let lastWasAgent = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const val = line.slice(idx + 1).trim();
    if (key === "user-agent") {
      if (!cur || !lastWasAgent) {
        cur = { agents: [], rules: [] };
        groups.push(cur);
      }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (!cur) continue;
      if (key === "disallow" || key === "allow") cur.rules.push({ allow: key === "allow", path: val });
    }
  }
  return groups;
}

function ruleMatches(rulePath, p) {
  if (!rulePath) return false;
  const re = new RegExp("^" + rulePath.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$"));
  return re.test(p);
}

function allowedFor(groups, agent, p) {
  const matching = groups.filter((g) => g.agents.includes(agent));
  const use = matching.length ? matching : null;
  if (!use) return null; // 해당 agent 그룹 없음
  let best = null;
  for (const g of use)
    for (const r of g.rules) {
      if (r.path === "" && !r.allow) continue; // "Disallow:" 빈 값 = 전부 허용
      if (ruleMatches(r.path, p) && (!best || r.path.length > best.path.length)) best = r;
    }
  return best ? best.allow : true;
}

/** "*"와 AI 크롤러 그룹 중 하나라도 막으면 false */
export async function robotsAllowed(url) {
  const u = new URL(url);
  const key = u.origin;
  if (!robotsCache.has(key)) {
    try {
      const r = await politeFetch(`${key}/robots.txt`, { delay: 200 });
      robotsCache.set(key, r.ok ? parseRobots(await r.text()) : []);
    } catch {
      robotsCache.set(key, []);
    }
  }
  const groups = robotsCache.get(key);
  const p = u.pathname + u.search;
  for (const agent of ["*", ...AI_AGENTS]) {
    if (allowedFor(groups, agent, p) === false) return false;
  }
  return true;
}

// ---------- 파싱 (의존성 없는 가벼운 XML 처리) ----------

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
export function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);
}

export function stripHtml(s) {
  return decodeEntities(
    decodeEntities(s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1"))
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"));
  return m ? m[1] : null;
}

/** RSS 2.0 / Atom 공통 */
export function parseFeed(xml) {
  const items = [];
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) ?? [];
  for (const b of blocks) {
    const title = stripHtml(tag(b, "title") ?? "");
    let link = stripHtml(tag(b, "link") ?? "");
    if (!link) {
      // Atom: <link rel='alternate' href='...'/> (작은따옴표·여러 link 요소 허용)
      const links = [...b.matchAll(/<link\b([^>]*)\/?>/gi)].map((m) => m[1]);
      const pick = links.find((a) => /rel=["']alternate["']/i.test(a)) ?? links.find((a) => !/rel=/i.test(a)) ?? links[0];
      link = pick?.match(/href=["']([^"']+)["']/i)?.[1] ?? "";
    }
    const date = stripHtml(tag(b, "pubDate") ?? tag(b, "published") ?? tag(b, "updated") ?? tag(b, "dc:date") ?? "");
    const desc = stripHtml(tag(b, "description") ?? tag(b, "summary") ?? tag(b, "content") ?? "");
    const cats = [...b.matchAll(/<category[^>]*>([\s\S]*?)<\/category>/gi)].map((m) => stripHtml(m[1])).filter(Boolean);
    if (title && link) items.push({ title, url: link.trim(), date, description: desc, categories: cats });
  }
  return items;
}

export function parseSitemap(xml) {
  const out = [];
  for (const m of xml.matchAll(/<(url|sitemap)>([\s\S]*?)<\/\1>/gi)) {
    const loc = stripHtml(tag(m[2], "loc") ?? "");
    const lastmod = stripHtml(tag(m[2], "lastmod") ?? "");
    if (loc) out.push({ kind: m[1].toLowerCase(), loc, lastmod });
  }
  return out;
}

/** 페이지에서 메타만 읽는다 (본문은 저장하지 않는다) */
export function parseMeta(html) {
  const meta = (prop) => {
    const re1 = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']`, "i");
    const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop}["']`, "i");
    const m = html.match(re1) ?? html.match(re2);
    return m ? decodeEntities(m[1]).trim() : null;
  };
  let published = meta("article:published_time") ?? meta("og:article:published_time") ?? meta("date") ?? meta("publish-date");
  if (!published) {
    const m = html.match(/"datePublished"\s*:\s*"([^"]+)"/);
    if (m) published = m[1];
  }
  const title = meta("og:title") ?? stripHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  return { title, description: meta("og:description") ?? meta("description") ?? "", published };
}

// ---------- 정규화·중복 ----------

export function canonicalUrl(url) {
  try {
    const u = new URL(url);
    u.hash = "";
    for (const k of [...u.searchParams.keys()]) if (/^(utm_|ref$|source$|fbclid|gclid)/i.test(k)) u.searchParams.delete(k);
    u.host = u.host.toLowerCase().replace(/^www\./, "");
    let s = u.toString();
    if (s.endsWith("/") && u.pathname !== "/") s = s.slice(0, -1);
    return s;
  } catch {
    return url;
  }
}

export const candidateId = (url) => crypto.createHash("sha1").update(canonicalUrl(url)).digest("hex").slice(0, 12);

export function isoDate(s) {
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

/** 일반 뉴스룸(마이크로소프트·메타 등)에서 AI 관련 글만 남기는 느슨한 필터 */
const AI_RE =
  /\b(AI|A\.I\.|artificial intelligence|machine learning|LLM|model|models|agent|agents|agentic|copilot|gemini|llama|chatgpt|gpt|claude|genai|generative|neural|inference|GPU|data ?center|superintelligence|MAI|foundry|nemotron|cosmos|blackwell|rubin|dgx)\b/i;
export function isAiRelevant(item) {
  return AI_RE.test(`${item.title} ${item.description.slice(0, 400)} ${(item.categories ?? []).join(" ")}`);
}

export function monthKey(iso) {
  return iso.slice(0, 7);
}

/** 후보 저장소: ingest/candidates/YYYY-MM.json (url 기준 중복 없음) */
export function loadAllCandidates() {
  const map = new Map();
  if (!fs.existsSync(CANDIDATE_DIR)) return map;
  for (const f of fs.readdirSync(CANDIDATE_DIR).filter((f) => f.endsWith(".json"))) {
    for (const c of readJson(path.join(CANDIDATE_DIR, f), [])) map.set(c.id, c);
  }
  return map;
}

export function saveCandidates(map) {
  const byMonth = new Map();
  for (const c of map.values()) {
    const k = monthKey(c.publishedAt);
    if (!byMonth.has(k)) byMonth.set(k, []);
    byMonth.get(k).push(c);
  }
  fs.mkdirSync(CANDIDATE_DIR, { recursive: true });
  for (const [k, list] of byMonth) {
    list.sort((a, b) => a.publishedAt.localeCompare(b.publishedAt) || a.id.localeCompare(b.id));
    writeJson(path.join(CANDIDATE_DIR, `${k}.json`), list);
  }
}
