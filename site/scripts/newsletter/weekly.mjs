/**
 * AI마중 주간 뉴스레터 (Phase 7.1.4) — 준비 · 검증 · 승인 · 발송의 공통 규칙
 *
 * 흐름: 발행된 기사(content/stories) → 대상 주간 기사 선정 → 편집 호 원고(edition.json) → QA → 상태(state.json)
 *        → 편집자 승인(서명) → 별도 수동 발송 (Resend Broadcast, 기존 newsletter:send와 같은 서비스)
 *
 * - 유료 LLM을 쓰지 않는다. 모든 문장은 기사에 이미 있는 제목·요약·핵심 사실·왜 중요한가를 그대로 옮긴다.
 *   코드가 만드는 문장은 날짜·건수를 채우는 고정 문장(dateLine·intro·제목 꼬리)뿐이다.
 * - 주차는 실행 시각이 아니라 edition ID(한국 시간 일요일 날짜)로 정한다. 대상 기간 = ID-7일 ~ ID-1일 (일~토).
 * - 준비(prepare) 쪽은 발송 서비스를 import하지 않는다. 네트워크는 Production 사이트맵 읽기(GET) 하나뿐이다.
 * - 원고는 newsletter/weekly/<id>/에 둔다. 웹 편집 호(newsletter/editions)와 섞지 않으므로 사이트에 나가지 않는다.
 *
 * 상태: DRAFT(검토 필요 항목 있음) · HOLD(발송 불가) · READY(자동 검증 통과 — 승인 아님) · APPROVED(편집자 서명) · SENT
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { audit } from "../qa/quality-rules.mjs";
import { ROOT, renderEditionEmail } from "./lib.mjs";

export const WEEKLY_DIR = path.join(ROOT, "newsletter/weekly");
export const EDITIONS_DIR = path.join(ROOT, "newsletter/editions");
export const SENT_FILE = path.join(ROOT, "ingest/newsletter-sent.json");
export const STATUSES = ["DRAFT", "HOLD", "READY", "APPROVED", "SENT"];

/**
 * 기본값. 기존 운영 문서에 주간 최소 기사 수 정책이 없어 설정으로 둔다 (env로 바꿀 수 있다).
 * minStories 3 = 1호(2026-10-06)의 구성(메인 1 + 함께 볼 기사 2)과 같은 최소 구성.
 */
export const WEEKLY_DEFAULTS = {
  minStories: 3, // 메인 + 함께 볼 변화가 이보다 적으면 HOLD
  moreMax: 4, // 함께 볼 변화 최대
  readMoreMax: 4, // 추가로 읽을 기사 최대
  importantPriority: 2, // 메인·함께 볼 변화에 넣는 기사 priority 상한 (1이 가장 중요). 그보다 낮으면 '추가로 읽을 기사'로만
  maxPerCompany: 2, // 메인·함께 볼 변화에서 같은 회사(첫 번째 회사) 기사 상한
  maxEventAgeDays: 14, // 대상 기간 시작보다 이만큼 이전에 발표된 소식은 '최신 소식'이 아니므로 제외
  freeContactLimit: 1000, // Resend 무료 플랜 마케팅 연락처 한도 (resend.com/pricing, 2026-10-12 확인)
  sendTimeoutMs: 30000,
};
const ENV_KEYS = {
  minStories: "NEWSLETTER_WEEKLY_MIN_STORIES",
  moreMax: "NEWSLETTER_WEEKLY_MORE_MAX",
  readMoreMax: "NEWSLETTER_WEEKLY_READ_MORE_MAX",
  importantPriority: "NEWSLETTER_WEEKLY_IMPORTANT_PRIORITY",
  maxPerCompany: "NEWSLETTER_WEEKLY_MAX_PER_COMPANY",
  maxEventAgeDays: "NEWSLETTER_WEEKLY_MAX_EVENT_AGE_DAYS",
  freeContactLimit: "NEWSLETTER_FREE_CONTACT_LIMIT",
  sendTimeoutMs: "NEWSLETTER_WEEKLY_SEND_TIMEOUT_MS",
};
export function loadWeeklyConfig(env = process.env) {
  const cfg = { ...WEEKLY_DEFAULTS };
  for (const [k, name] of Object.entries(ENV_KEYS)) {
    const v = env[name];
    if (v === undefined || v === "") continue;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0) throw new Error(`${name}는 0 이상의 정수여야 합니다`);
    cfg[k] = n;
  }
  if (cfg.minStories < 1) cfg.minStories = 1; // 0건 호는 어떤 설정으로도 만들지 않는다
  return cfg;
}

// ---------- 날짜 (한국 시간) ----------

const DAY = 86400000;
export const isDate = (d) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;
export const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const dow = (d) => new Date(`${d}T00:00:00Z`).getUTCDay();
/** 지금의 한국 날짜 (Asia/Seoul은 서머타임이 없어 +9시간 고정) */
export const kstDate = (now = new Date()) => new Date(now.getTime() + 9 * 3600000).toISOString().slice(0, 10);
export const isSunday = (d) => isDate(d) && dow(d) === 0;
/** 이 날짜(한국)가 속한 주의 edition ID = 그날 또는 그 이전의 가장 가까운 일요일. 예약 실행이 늦어져도 같은 주를 가리킨다 */
export const editionIdFor = (d) => addDays(d, -dow(d));
/** 대상 기간: 직전 일요일 ~ 토요일 (edition ID 전날까지 7일) */
export function weekPeriod(id) {
  if (!isSunday(id)) throw new Error(`edition ID는 일요일 날짜여야 합니다 (받은 값: ${id})`);
  return { start: addDays(id, -7), end: addDays(id, -1) };
}
const md = (d) => `${Number(d.slice(5, 7))}.${Number(d.slice(8, 10))}`;
export const periodLabel = (p) => `${md(p.start)}–${md(p.end)}`;

// ---------- Production 확인 ----------

/** 사이트맵에서 기사 slug를 뽑는다 (/stories/<slug>/) */
export function parseSitemapSlugs(xml, siteUrl) {
  const base = siteUrl.replace(/\/$/, "");
  const out = new Set();
  for (const m of String(xml).matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
    const u = m[1];
    if (!u.startsWith(`${base}/stories/`)) continue;
    const slug = u.slice(`${base}/stories/`.length).replace(/\/$/, "");
    if (/^[a-z0-9-]+$/.test(slug)) out.add(slug);
  }
  return out;
}

/**
 * Production 사이트맵(GET 한 번)으로 실제 발행된 기사인지 확인한다. 실패하면 ok:false (성공한 척하지 않음).
 * @param {typeof fetch} fetchImpl
 */
export async function fetchProduction(siteUrl, fetchImpl = globalThis.fetch, timeoutMs = 20000) {
  const url = `${siteUrl.replace(/\/$/, "")}/sitemap.xml`;
  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs), headers: { "user-agent": "aimajung-weekly-newsletter" } });
    if (!res.ok) return { ok: false, url, error: `HTTP ${res.status}`, slugs: new Set() };
    const slugs = parseSitemapSlugs(await res.text(), siteUrl);
    if (!slugs.size) return { ok: false, url, error: "사이트맵에 기사가 없음", slugs };
    return { ok: true, url, slugs };
  } catch (e) {
    return { ok: false, url, error: e?.name === "TimeoutError" ? "시간 초과" : "접속 실패", slugs: new Set() };
  }
}

// ---------- 기존 호 · 파일 ----------

const readJson = (p, fallback) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : fallback);
const writeJson = (p, v) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(v, null, 2) + "\n");
};
/** 내용이 같으면 쓰지 않는다 (재실행 때 불필요한 변경·PR 갱신을 막음). 바뀌었으면 true */
function writeIfChanged(p, text) {
  if (fs.existsSync(p) && fs.readFileSync(p, "utf8") === text) return false;
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text);
  return true;
}

export const weeklyPaths = (id, dir = WEEKLY_DIR) => {
  if (!isSunday(id)) throw new Error(`edition ID는 일요일 날짜(YYYY-MM-DD)여야 합니다: ${id}`);
  const d = path.join(dir, id);
  return { dir: d, edition: path.join(d, "edition.json"), state: path.join(d, "state.json"), html: path.join(d, "preview.html"), text: path.join(d, "preview.txt"), report: path.join(d, "report.md") };
};
export const loadWeekly = (id, dir = WEEKLY_DIR) => {
  const p = weeklyPaths(id, dir);
  return { paths: p, edition: readJson(p.edition, null), state: readJson(p.state, null) };
};

/** 이미 메일로 낸(또는 승인된) 호에 실린 기사 → 다시 싣지 않는다. 지금 만드는 호는 빼고 본다 */
export function usedSlugs({ editionsDir = EDITIONS_DIR, weeklyDir = WEEKLY_DIR, exceptId = null } = {}) {
  const used = new Map();
  const add = (e, label) => {
    for (const slug of [e.main?.slug, ...(e.more ?? []).map((m) => m.slug), ...(e.checked ?? []).map((m) => m.slug), ...(e.readMore ?? []).map((m) => m.slug)])
      if (slug && !used.has(slug)) used.set(slug, label);
  };
  if (fs.existsSync(editionsDir)) for (const f of fs.readdirSync(editionsDir).filter((x) => x.endsWith(".json"))) add(readJson(path.join(editionsDir, f)), f.replace(/\.json$/, ""));
  if (fs.existsSync(weeklyDir))
    for (const id of fs.readdirSync(weeklyDir)) {
      if (id === exceptId || !isSunday(id)) continue;
      const { edition, state } = loadWeekly(id, weeklyDir);
      if (edition && state && (state.status === "APPROVED" || state.status === "SENT")) add(edition, `주간 ${id}`);
    }
  return used;
}

// ---------- 기사 선정 ----------

const norm = (t) => String(t ?? "").replace(/[\s'"‘’“”·…,.()!?\-–—:]/g, "");
function bigramOverlap(a, b) {
  const grams = (t) => {
    const s = norm(t);
    const g = new Set();
    for (let i = 0; i < s.length - 1; i++) g.add(s.slice(i, i + 2));
    return g;
  };
  const A = grams(a);
  const B = grams(b);
  if (!A.size || !B.size) return 0;
  let n = 0;
  for (const x of A) if (B.has(x)) n++;
  return n / Math.min(A.size, B.size);
}
/** 같은 사안을 다룬 기사인지: 제목이 거의 같거나, 같은 회사·같은 제품·발표일 3일 이내 */
export function sameTopic(a, b) {
  if (bigramOverlap(a.title, b.title) >= 0.6) return true;
  const products = new Set((a.products ?? []).map((x) => x.toLowerCase()));
  const sharedProduct = (b.products ?? []).some((x) => products.has(x.toLowerCase()));
  const sameCompany = (a.companies?.[0] ?? a.sourceName) === (b.companies?.[0] ?? b.sourceName);
  const days = Math.abs(Date.parse(a.eventDate) - Date.parse(b.eventDate)) / DAY;
  return sharedProduct && sameCompany && days <= 3;
}
const DEPTH_SCORE = { deep: 4, standard: 2, short: 0 };
/** 중요도(priority) > 깊이 > 품질 PASS > 이번 주 발표. 같은 점수는 발표일 최신 → slug */
export const scoreStory = (s, q, period) => (4 - s.priority) * 10 + (DEPTH_SCORE[s.editorialDepth] ?? 0) + (q.status === "PASS" ? 3 : 0) + (s.eventDate >= period.start ? 2 : 0);

/**
 * 대상 주간 기사 선정. 억지로 채우지 않는다: 기준에 맞는 기사가 모자라면 그대로 모자란 채로 두고 QA가 HOLD한다.
 * @returns {{main:any|null, more:any[], readMore:any[], rows:{slug,title,publishedAt,eventDate,quality,decision,reasons:string[]}[], inPeriod:number}}
 */
export function selectWeekly(stories, { period, production, used, cfg }) {
  const rows = [];
  const pool = [];
  const oldest = addDays(period.start, -cfg.maxEventAgeDays);
  for (const s of stories) {
    if (!(s.publishedAt >= period.start && s.publishedAt <= period.end)) continue; // AI마중 발행일 기준으로 이번 주 기사만
    const q = audit(s);
    const reasons = [];
    if (s.status !== "published") reasons.push(`미발행 (status: ${s.status ?? "없음"})`);
    if (production.ok && !production.slugs.has(s.slug)) reasons.push("Production 사이트맵에 없음 (실제 발행 미확인)");
    if (q.status === "FAIL") reasons.push(`기사 QA FAIL (${q.reasons.join(", ")})`);
    if (used.has(s.slug)) reasons.push(`이미 ${used.get(s.slug)} 호에 실림`);
    if (!(s.eventDate >= oldest)) reasons.push(`최신 소식 아님 (발표일 ${s.eventDate})`);
    if (!/^https:\/\//.test(s.sourceUrl ?? "")) reasons.push("원문 주소 없음");
    const row = { slug: s.slug, title: s.title, publishedAt: s.publishedAt, eventDate: s.eventDate, priority: s.priority, quality: q.status, decision: "EXCLUDE", reasons };
    rows.push(row);
    if (!reasons.length) pool.push({ s, q, row, score: scoreStory(s, q, period) });
  }
  pool.sort((a, b) => b.score - a.score || b.s.eventDate.localeCompare(a.s.eventDate) || a.s.slug.localeCompare(b.s.slug));

  const picked = [];
  const later = [];
  const perCompany = new Map();
  for (const c of pool) {
    const dup = [...picked, ...later].find((p) => sameTopic(p.s, c.s));
    if (dup) {
      c.row.reasons.push(`같은 주제 중복 (${dup.s.slug})`);
      continue;
    }
    const company = c.s.companies?.[0] ?? c.s.sourceName;
    if (c.s.priority > cfg.importantPriority) {
      c.row.note = `중요도 ${c.s.priority} — 추가로 읽을 기사 후보`;
      later.push(c);
    } else if ((perCompany.get(company) ?? 0) >= cfg.maxPerCompany) {
      c.row.note = `같은 회사(${company}) 기사 상한 — 추가로 읽을 기사 후보`;
      later.push(c);
    } else if (picked.length >= 1 + cfg.moreMax) {
      c.row.note = "주요 기사 상한 — 추가로 읽을 기사 후보";
      later.push(c);
    } else {
      picked.push(c);
      perCompany.set(company, (perCompany.get(company) ?? 0) + 1);
    }
  }
  const readMore = later.slice(0, cfg.readMoreMax);
  for (const c of later.slice(cfg.readMoreMax)) c.row.reasons.push("추가로 읽을 기사 상한 초과");
  picked.forEach((c, i) => (c.row.decision = i === 0 ? "MAIN" : "MORE"));
  for (const c of readMore) c.row.decision = "READ_MORE";
  rows.sort((a, b) => ({ MAIN: 0, MORE: 1, READ_MORE: 2, EXCLUDE: 3 })[a.decision] - ({ MAIN: 0, MORE: 1, READ_MORE: 2, EXCLUDE: 3 })[b.decision] || b.publishedAt.localeCompare(a.publishedAt) || a.slug.localeCompare(b.slug));
  return { main: picked[0]?.s ?? null, more: picked.slice(1).map((c) => c.s), readMore: readMore.map((c) => c.s), rows, inPeriod: rows.length };
}

// ---------- 원고 만들기 (AI 없이, 기사 문장 그대로) ----------

const source = (s) => ({ name: s.sourceName, url: s.sourceUrl });
export const subjectFor = (main, others) => `🤖 ${main.title}${others ? ` 외 ${others}건` : ""} — AI마중 주간`;
export function introFor(period, inPeriod, chosen) {
  return [`${periodLabel(period)} 한 주 동안 AI마중에 실린 기사 ${inPeriod}건 가운데 ${chosen}건을 골랐습니다. 모든 내용은 각 기사에 이미 실린 문장이며, 기사마다 공식 원문 링크를 함께 적었습니다.`];
}
const firstSentence = (t, max = 90) => {
  const s = String(t ?? "").trim();
  const m = s.match(/^.+?(?:다\.|요\.|[.!?])(?=\s|$)/);
  const x = m ? m[0] : s;
  return x.length > max ? `${x.slice(0, max - 1).trimEnd()}…` : x;
};

/** 선정 결과 → 편집 호 원고 (기존 newsletter/editions 형식 + kind:weekly). 메인이 없으면 null */
export function buildWeeklyEdition(id, sel, period) {
  if (!sel.main) return null;
  const m = sel.main;
  const others = sel.more.length + sel.readMore.length;
  return {
    id,
    kind: "weekly",
    number: null,
    period,
    dateLine: `${id.replaceAll("-", ".")} · 이번 주 AI (${periodLabel(period)})`,
    subject: subjectFor(m, others),
    preheader: `${firstSentence(m.summary)}${others ? ` 외 ${others}건을 함께 정리했습니다.` : ""}`,
    intro: introFor(period, sel.inPeriod, 1 + others),
    containsAdvertising: false,
    main: {
      slug: m.slug,
      title: m.title,
      body: [m.editorialDepth === "deep" && m.lead ? m.lead : m.summary],
      facts: (m.facts ?? []).slice(0, 3),
      point: m.whyItMatters,
      cta: "기사 전체 읽기 →",
      source: source(m),
    },
    more: sel.more.map((s) => ({ slug: s.slug, title: s.title, change: s.summary, why: s.whyItMatters, source: source(s) })),
    checked: [],
    readMore: sel.readMore.map((s) => ({ slug: s.slug })),
  };
}

// ---------- 해시 ----------

const canonical = (v) =>
  Array.isArray(v) ? `[${v.map(canonical).join(",")}]` : v && typeof v === "object" ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}` : JSON.stringify(v);
/** 원고 내용 해시 (승인 대상). 한 글자라도 바뀌면 달라진다 */
export const contentHash = (edition) => crypto.createHash("sha256").update(canonical(edition)).digest("hex");
export const shortHash = (h) => String(h).slice(0, 12);

// ---------- QA ----------

const NUM = /\d+(?:[.,]\d+)*/g;
const numbers = (t) => String(t ?? "").match(NUM) ?? [];
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const KEY_RE = /\bre_[A-Za-z0-9_]{8,}|sk-ant-[A-Za-z0-9_-]{8,}/;

/**
 * 원고 점검. FAIL → HOLD, REVIEW → DRAFT, 통과 → READY (READY는 승인이 아니다).
 * @returns {{verdict:"PASS"|"REVIEW"|"FAIL", items:{level:"FAIL"|"REVIEW", code:string, msg:string}[]}}
 */
export function qaWeekly(edition, { stories, period, production, used, cfg, config, inPeriod = null }) {
  const items = [];
  const fail = (code, msg) => items.push({ level: "FAIL", code, msg });
  const review = (code, msg) => items.push({ level: "REVIEW", code, msg });
  if (!production.ok) fail("PRODUCTION", `Production 발행 여부를 확인하지 못함 (${production.error ?? "확인 안 함"}) — 확인될 때까지 발송 불가`);
  if (!edition) {
    fail("EMPTY", "대상 주간에 실을 수 있는 기사가 0건");
    return { verdict: "FAIL", items };
  }
  const bySlug = new Map(stories.map((s) => [s.slug, s]));
  const oldest = addDays(period.start, -cfg.maxEventAgeDays);
  if (edition.id !== undefined && !isSunday(edition.id)) fail("ID", "edition ID가 일요일 날짜가 아님");
  if (edition.kind !== "weekly") fail("KIND", "kind가 weekly가 아님");
  if (edition.containsAdvertising) fail("AD", "광고 포함 호 — (광고) 표시·수신 동의 2년 주기 확인 등 별도 요건이 필요해 이 시스템으로 보내지 않음");

  const main = edition.main;
  const more = edition.more ?? [];
  const readMore = edition.readMore ?? [];
  const majors = [main, ...more].filter(Boolean);
  if (majors.length < cfg.minStories) fail("TOO_FEW", `주요 기사 ${majors.length}건 — 최소 ${cfg.minStories}건 필요 (NEWSLETTER_WEEKLY_MIN_STORIES)`);

  const seen = new Set();
  const check = (slug, role) => {
    const s = bySlug.get(slug);
    if (!s) {
      fail("MISSING", `${slug}: 없는 기사`);
      return null;
    }
    if (seen.has(slug)) fail("DUP", `${slug}: 같은 호에 두 번`);
    seen.add(slug);
    if (s.status !== "published") fail("UNPUBLISHED", `${slug}: 미발행 기사 (status ${s.status})`);
    if (production.ok && !production.slugs.has(slug)) fail("NOT_LIVE", `${slug}: Production 사이트맵에 없음`);
    const q = audit(s);
    if (q.status === "FAIL") fail("QA_FAIL", `${slug}: 기사 QA FAIL`);
    else if (q.status === "REVIEW" && role !== "readMore") review("QA_REVIEW", `${slug}: 기사 QA REVIEW — ${q.reasons.join(", ")}`);
    if (used.has(slug)) fail("ALREADY_SENT", `${slug}: 이미 ${used.get(slug)} 호에 실림`);
    if (!(s.publishedAt >= period.start && s.publishedAt <= period.end)) fail("PERIOD", `${slug}: 대상 주간(${period.start}~${period.end}) 발행 기사가 아님 (발행 ${s.publishedAt})`);
    if (!(s.eventDate >= oldest)) fail("STALE", `${slug}: 최신 소식 아님 (발표일 ${s.eventDate})`);
    if (!/^https:\/\//.test(s.sourceUrl ?? "")) fail("NO_SOURCE", `${slug}: 원문 주소 없음`);
    return s;
  };
  // 기사 문장 대조: 바뀐 문장은 REVIEW, 기사에 없는 숫자는 FAIL (사실·수치를 새로 만들지 않음)
  const storyText = (s) => [s.title, s.summary, s.lead, s.whyItMatters, s.whatChanges, ...(s.facts ?? []), ...(s.sections ?? []).flatMap((x) => [...(x.paragraphs ?? []), ...(x.bullets ?? [])])].join("\n");
  const same = (slug, field, got, allowed) => {
    if (!allowed.includes(got)) review("EDITED", `${slug}: ${field}이(가) 기사 문장과 다름 — 편집자가 고친 문장인지 확인`);
  };
  const nums = (slug, s, field, t) => {
    const src = new Set(numbers(storyText(s)));
    const bad = numbers(t).filter((n) => !src.has(n));
    if (bad.length) fail("NUMBER", `${slug}: ${field}에 기사에 없는 숫자 ${[...new Set(bad)].join(", ")}`);
  };
  if (main) {
    const s = check(main.slug, "main");
    if (s) {
      same(main.slug, "메인 제목", main.title, [s.title]);
      main.body.forEach((t, i) => same(main.slug, `메인 본문 ${i + 1}`, t, [s.summary, s.lead].filter(Boolean)));
      (main.facts ?? []).forEach((t, i) => same(main.slug, `핵심 사실 ${i + 1}`, t, s.facts ?? []));
      if (main.point) same(main.slug, "POINT", main.point, [s.whyItMatters]);
      for (const [f, t] of [["메인 제목", main.title], ["메인 본문", main.body.join(" ")], ["핵심 사실", (main.facts ?? []).join(" ")], ["POINT", main.point ?? ""]]) nums(main.slug, s, f, t);
      if (main.source?.url !== s.sourceUrl) fail("SOURCE", `${main.slug}: 원문 링크가 기사의 원문 주소와 다름`);
    }
  } else fail("NO_MAIN", "메인 기사 없음");
  for (const m of more) {
    const s = check(m.slug, "more");
    if (!s) continue;
    same(m.slug, "제목", m.title, [s.title]);
    same(m.slug, "요약", m.change, [s.summary]);
    if (m.why) same(m.slug, "왜 봐야 하나", m.why, [s.whyItMatters]);
    for (const [f, t] of [["제목", m.title], ["요약", m.change], ["왜 봐야 하나", m.why ?? ""]]) nums(m.slug, s, f, t);
    if (m.source?.url !== s.sourceUrl) fail("SOURCE", `${m.slug}: 원문 링크가 기사의 원문 주소와 다름`);
  }
  for (const r of readMore) check(r.slug, "readMore");

  // 코드가 만든 고정 문장: 숫자가 실제 건수·기간과 같아야 한다
  const chosen = majors.length + readMore.length;
  if (main && bySlug.get(main.slug)) {
    const expectSubject = subjectFor(bySlug.get(main.slug), chosen - 1);
    if (edition.subject !== expectSubject) {
      review("SUBJECT_EDITED", "제목이 기본 형식과 다름 — 편집자 확인");
      const allowed = new Set([...numbers(bySlug.get(main.slug).title), String(chosen - 1)]);
      const bad = numbers(edition.subject).filter((n) => !allowed.has(n));
      if (bad.length) fail("NUMBER", `제목에 근거 없는 숫자 ${bad.join(", ")}`);
    }
  }
  if (inPeriod !== null) {
    const expectIntro = introFor(period, inPeriod, chosen);
    if (JSON.stringify(edition.intro) !== JSON.stringify(expectIntro)) {
      review("INTRO_EDITED", "인트로가 기본 문장과 다름 — 편집자 확인");
      const allowed = new Set([...numbers(periodLabel(period)), String(inPeriod), String(chosen)]);
      const bad = (edition.intro ?? []).flatMap(numbers).filter((n) => !allowed.has(n));
      if (bad.length) fail("NUMBER", `인트로에 근거 없는 숫자 ${bad.join(", ")}`);
    }
  }
  const pre = String(edition.preheader ?? "");
  if (main && bySlug.get(main.slug)) {
    const allowed = new Set([...numbers(storyText(bySlug.get(main.slug))), String(chosen - 1)]);
    const bad = numbers(pre).filter((n) => !allowed.has(n));
    if (bad.length) fail("NUMBER", `프리헤더에 근거 없는 숫자 ${bad.join(", ")}`);
  }
  if (!edition.subject || [...edition.subject].length > 80) review("SUBJECT_LONG", "제목이 비었거나 80자 초과");
  if (/\(광고\)/.test(edition.subject ?? "") && !edition.containsAdvertising) review("AD_LABEL", "광고 표시가 있는데 containsAdvertising이 false");

  // 렌더링 확인: 실제 발송 모드에서 구독 해지 자리 · 링크 · 깨진 값
  if (main && !items.some((i) => i.code === "MISSING")) {
    const mail = renderEditionEmail(edition, { mode: "broadcast", allStories: stories, config });
    if (!mail.html.includes("{{{RESEND_UNSUBSCRIBE_URL}}}") || !mail.text.includes("{{{RESEND_UNSUBSCRIBE_URL}}}")) fail("UNSUBSCRIBE", "메일에 구독 해지 링크 자리가 없음");
    if (/>\s*(undefined|null)\s*</.test(mail.html) || /\bundefined\b/.test(mail.text)) fail("RENDER", "메일에 빈 값(undefined/null)이 보임");
    const site = config.siteConfig.url.replace(/\/$/, "");
    for (const slug of seen) if (!mail.html.includes(`${site}/stories/${slug}/`)) fail("LINK", `${slug}: 기사 링크 없음`);
    if (EMAIL_RE.test(JSON.stringify(edition))) fail("EMAIL", "원고에 이메일 주소가 있음");
    if (KEY_RE.test(mail.html) || KEY_RE.test(JSON.stringify(edition))) fail("SECRET", "원고에 키처럼 보이는 문자열");
  }
  const verdict = items.some((i) => i.level === "FAIL") ? "FAIL" : items.length ? "REVIEW" : "PASS";
  return { verdict, items };
}
export const statusFromQa = (qa) => (qa.verdict === "FAIL" ? "HOLD" : qa.verdict === "REVIEW" ? "DRAFT" : "READY");

// ---------- 발송 요건 (설정 · 법적 표기) ----------

/**
 * 전체 발송 전에 꼭 있어야 하는 것. 하나라도 빠지면 전체 발송을 막는다 (테스트 주소 발송은 막지 않음).
 * 정보통신망법 제50조 등: 전송자 명칭·연락처, 수신 거부 수단 표시. (광고 포함 호는 QA에서 막는다)
 */
export function sendRequirements(env, newsletterConfig, mail = null) {
  const problems = [];
  const operatorInfo = (env.NEWSLETTER_OPERATOR_INFO || newsletterConfig.newsletterOperatorInfo || "").trim();
  if (!operatorInfo) problems.push("발행인 정보(NEWSLETTER_OPERATOR_INFO: 전송자 명칭·연락처) 없음 — 메일 하단 표기 의무");
  else if (operatorInfo.length < 8) problems.push("발행인 정보가 너무 짧음 (명칭과 연락처를 모두 적어야 함)");
  if (!(env.NEWSLETTER_REPLY_TO || newsletterConfig.newsletterReplyTo || "").trim()) problems.push("Reply-To(NEWSLETTER_REPLY_TO) 없음 — 답장·수신거부 요청을 받을 받은편지함");
  if (mail) {
    if (!mail.html.includes("{{{RESEND_UNSUBSCRIBE_URL}}}") || !mail.text.includes("{{{RESEND_UNSUBSCRIBE_URL}}}")) problems.push("구독 해지 링크 자리 없음");
    if (operatorInfo && (!mail.text.includes(operatorInfo) || !mail.html.includes(escHtml(operatorInfo)))) problems.push("메일 하단에 발행인 정보가 들어가지 않음");
  }
  return problems;
}
const escHtml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

// ---------- 승인 서명 ----------

const APPROVAL_V = "aimajung-weekly-approval-v1";
export function approvalSecretProblem(secret) {
  if (!secret) return "NEWSLETTER_APPROVAL_SECRET 없음 (승인·발송하는 사람만 가진 비밀값)";
  if (String(secret).length < 32) return "NEWSLETTER_APPROVAL_SECRET이 32자 미만";
  return null;
}
export const signApproval = (secret, a) => crypto.createHmac("sha256", secret).update(JSON.stringify([APPROVAL_V, a.id, a.contentHash, a.approver, a.approvedAt])).digest("hex");
/** 승인이 지금 원고에 유효한지: 서명 · 해시 일치. 원고가 바뀌었으면 무효 */
export function approvalProblems(state, edition, secret) {
  const a = state?.approval;
  if (!a) return ["승인 기록 없음"];
  const problems = [];
  const secretProblem = approvalSecretProblem(secret);
  if (secretProblem) problems.push(secretProblem);
  else {
    const want = signApproval(secret, a);
    const ok = typeof a.signature === "string" && a.signature.length === want.length && crypto.timingSafeEqual(Buffer.from(a.signature), Buffer.from(want));
    if (!ok) problems.push("승인 서명이 맞지 않음 (승인 기록이 위조·수정되었거나 다른 비밀값)");
  }
  if (a.id !== edition?.id) problems.push("승인한 edition ID가 다름");
  if (a.contentHash !== contentHash(edition)) problems.push("승인 뒤 원고가 바뀜 — 승인 무효, 다시 검토·승인 필요");
  return problems;
}

// ---------- 로그 보호 ----------

/** 출력·기록 전에 키·비밀값·이메일 주소를 가린다 */
export function redact(text, env = process.env) {
  let s = String(text ?? "");
  for (const k of ["RESEND_API_KEY", "NEWSLETTER_APPROVAL_SECRET", "NEWSLETTER_CONFIRM_SECRET"]) {
    const v = env[k];
    if (v && v.length >= 6) s = s.split(v).join("[가림]");
  }
  return s.replace(/\bre_[A-Za-z0-9_]{6,}/g, "re_[가림]").replace(/([A-Z0-9._%+-]{1,2})[A-Z0-9._%+-]*@([A-Z0-9.-]+\.[A-Z]{2,})/gi, "$1***@$2");
}
/** 받는 사람 참조: 이메일·연락처 id를 직접 남기지 않고 비밀값으로 만든 짧은 해시만 (로컬 기록용) */
export const recipientRef = (secret, value) => crypto.createHmac("sha256", secret || "no-secret").update(String(value).trim().toLowerCase()).digest("hex").slice(0, 16);

// ---------- 준비 (예약 실행이 하는 일 전부) ----------

/**
 * 주간 호 준비: 선정 → 원고 → QA → 상태 · 미리보기 · 보고서. 이메일 발송·발송 서비스 호출 없음.
 * 이미 APPROVED/SENT인 호는 건드리지 않고, 사람이 고친 원고는 다시 만들지 않는다(QA만 다시).
 */
export async function prepareWeekly({ id, stories, config, env = process.env, fetchImpl = globalThis.fetch, now = new Date(), dir = WEEKLY_DIR, editionsDir = EDITIONS_DIR, sentFile = SENT_FILE, production = null }) {
  const cfg = loadWeeklyConfig(env);
  const period = weekPeriod(id);
  const paths = weeklyPaths(id, dir);
  const prev = loadWeekly(id, dir);
  const lastSent = readJson(sentFile, []).filter((r) => r.status === "sent").at(-1) ?? null;

  if (prev.state?.status === "SENT") return { id, status: "SENT", locked: true, changed: false, message: `${id} 호는 이미 발송(SENT)해 다시 만들지 않습니다` };
  // 승인된 원고가 그대로면 건드리지 않는다. 승인 뒤 원고가 바뀌었으면 승인을 무효로 하고 다시 검증한다
  const approvalStale = prev.state?.status === "APPROVED" && (!prev.edition || prev.state.approval?.contentHash !== contentHash(prev.edition));
  if (prev.state?.status === "APPROVED" && !approvalStale) return { id, status: "APPROVED", locked: true, changed: false, message: `${id} 호는 승인(APPROVED)된 원고 그대로라 다시 만들지 않습니다` };
  const prod = production ?? (await fetchProduction(config.siteConfig.url, fetchImpl));
  const used = usedSlugs({ editionsDir, weeklyDir: dir, exceptId: id });
  const sel = selectWeekly(stories, { period, production: prod, used, cfg });

  // 사람이 고친 원고면 그대로 두고 QA만 다시 한다
  const edited = Boolean(prev.edition && prev.state?.generatedHash && contentHash(prev.edition) !== prev.state.generatedHash);
  const generated = buildWeeklyEdition(id, sel, period);
  const edition = edited ? prev.edition : generated;
  const qa = qaWeekly(edition, { stories, period, production: prod, used, cfg, config, inPeriod: sel.inPeriod });
  const status = statusFromQa(qa);
  const hash = edition ? contentHash(edition) : null;
  const sameAsBefore = !approvalStale && prev.state && prev.state.contentHash === hash && prev.state.status === status && JSON.stringify(prev.state.qa) === JSON.stringify(qa);

  const state = {
    id,
    kind: "weekly",
    status,
    period,
    contentHash: hash,
    generatedHash: edited ? prev.state.generatedHash : hash,
    edited: Boolean(edited),
    preparedAt: sameAsBefore ? prev.state.preparedAt : now.toISOString(),
    production: { ok: prod.ok, checked: prod.url ?? null, error: prod.ok ? null : prod.error, stories: prod.slugs?.size ?? 0 },
    qa,
    selection: sel.rows,
    approval: null,
    send: prev.state?.send ?? null,
    history: [...(prev.state?.history ?? [])],
  };
  if (approvalStale) state.history.push({ at: now.toISOString(), event: "approval-invalidated", reason: "승인 뒤 원고 변경", approvedHash: shortHash(prev.state.approval?.contentHash ?? "") });
  if (!sameAsBefore) state.history.push({ at: now.toISOString(), event: "prepared", status, contentHash: hash ? shortHash(hash) : null, edited: Boolean(edited) });

  let changed = false;
  if (edition) changed = writeIfChanged(paths.edition, JSON.stringify(edition, null, 2) + "\n") || changed;
  else if (fs.existsSync(paths.edition)) {
    fs.rmSync(paths.edition);
    changed = true;
  }
  if (!sameAsBefore) {
    writeJson(paths.state, state);
    changed = true;
  }
  const finalState = sameAsBefore ? prev.state : state;
  if (edition) {
    const mail = renderEditionEmail(edition, { mode: "preview", allStories: stories, config });
    changed = writeIfChanged(paths.html, mail.html) || changed;
    changed = writeIfChanged(paths.text, mail.text + "\n") || changed;
  }
  const report = renderWeeklyReport({ edition, state: finalState, stories, config, env, lastSent, cfg });
  changed = writeIfChanged(paths.report, report) || changed;
  return { id, status, locked: false, changed, edited: Boolean(edited), qa, edition, state: finalState, report, paths };
}

// ---------- 보고서 (PR 본문) ----------

const cell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
const STATUS_TEXT = {
  DRAFT: "DRAFT — 자동 검증에 확인 필요 항목이 있음. 편집자 검토 후 `--ack-review`로 승인 가능",
  HOLD: "HOLD — 발송 불가 (아래 FAIL 항목 해결 전까지)",
  READY: "READY — 자동 검증 통과. **승인 아님**",
  APPROVED: "APPROVED — 편집자 서명 승인됨. 발송은 별도 수동 명령",
  SENT: "SENT — 발송 요청 완료",
};

export function renderWeeklyReport({ edition, state, stories, config, env = process.env, lastSent = null, cfg = WEEKLY_DEFAULTS }) {
  const site = config.siteConfig.url.replace(/\/$/, "");
  const bySlug = new Map(stories.map((s) => [s.slug, s]));
  const req = sendRequirements(env, config.newsletterConfig);
  const L = [];
  L.push(`# AI마중 주간 뉴스레터 ${state.id} — 편집자 검토`, "");
  L.push(`> 자동 준비 결과입니다. **이 PR을 merge해도 승인·발송되지 않습니다.** 승인은 서명된 승인 명령, 발송은 별도 수동 명령으로만 합니다.`, "");
  L.push("| 항목 | 내용 |", "|---|---|");
  L.push(`| edition ID | \`${state.id}\` (한국 시간 일요일) |`);
  L.push(`| 대상 주간 | ${state.period.start} (일) ~ ${state.period.end} (토) · AI마중 발행일 기준 |`);
  L.push(`| 상태 | **${STATUS_TEXT[state.status] ?? state.status}** |`);
  L.push(`| 원고 해시 | ${state.contentHash ? `\`${shortHash(state.contentHash)}\`` : "—"}${state.edited ? " (편집자가 고친 원고)" : ""} |`);
  if (edition) {
    L.push(`| 이메일 제목 | ${cell(edition.subject)} |`);
    L.push(`| 프리헤더 | ${cell(edition.preheader)} |`);
  }
  L.push(`| Production 확인 | ${state.production.ok ? `사이트맵 기사 ${state.production.stories}건과 대조` : `실패 (${cell(state.production.error)}) — HOLD`} |`);
  L.push(
    `| 발송 대상 예상 인원 | 준비 단계는 발송 서비스에 접속하지 않아 조회하지 않음. 승인·발송 점검 때 실제 구독 중 연락처 수를 확인합니다${lastSent ? ` (마지막 발송 기록: ${lastSent.date} · ${lastSent.recipients ?? "?"}명${lastSent.segmentId ? " · 지정 Segment" : ""})` : ""} |`,
  );
  const canSend = state.status === "APPROVED" && !req.length;
  L.push(`| 발송 가능 여부 | ${canSend ? "가능 (발송 명령 필요)" : `**아니오** — ${[state.status !== "APPROVED" ? `상태 ${state.status} (승인 필요)` : null, ...req].filter(Boolean).map(cell).join(" · ")}`} |`);
  L.push("");

  if (edition) {
    L.push("## 선정 기사", "", "| 구분 | 제목 | 기사 | 원문 | 발행 / 발표 | 기사 QA |", "|---|---|---|---|---|---|");
    const row = (kind, slug) => {
      const s = bySlug.get(slug);
      if (!s) return `| ${kind} | (없는 기사 ${slug}) | | | | |`;
      return `| ${kind} | ${cell(s.title)} | [${slug}](${site}/stories/${slug}/) | [${cell(s.sourceName)}](${s.sourceUrl}) | ${s.publishedAt} / ${s.eventDate} | ${audit(s).status} |`;
    };
    L.push(row("메인", edition.main.slug));
    for (const m of edition.more ?? []) L.push(row("함께 볼 변화", m.slug));
    for (const m of edition.readMore ?? []) L.push(row("추가로 읽을 기사", m.slug));
    L.push("");
  } else L.push("## 선정 기사", "", "없음 — 대상 주간에 실을 수 있는 기사가 없습니다.", "");

  const excluded = (state.selection ?? []).filter((r) => r.decision === "EXCLUDE");
  L.push(`## 대상 주간 기사 ${state.selection?.length ?? 0}건 중 제외 ${excluded.length}건`, "");
  if (excluded.length) {
    L.push("| 기사 | 발행 / 발표 | 제외 이유 |", "|---|---|---|");
    for (const r of excluded.slice(0, 60)) L.push(`| ${cell(r.title)} (\`${r.slug}\`) | ${r.publishedAt} / ${r.eventDate} | ${cell(r.reasons.join(" · "))} |`);
    if (excluded.length > 60) L.push(`| … ${excluded.length - 60}건 더 (state.json) | | |`);
  } else L.push("없음");
  L.push("");

  L.push(`## 자동 QA: ${state.qa.verdict}`, "");
  if (state.qa.items.length) for (const i of state.qa.items) L.push(`- **${i.level}** \`${i.code}\` ${i.msg}`);
  else L.push("- 문제 없음");
  L.push("");
  L.push("## 수정 필요 사항", "");
  const fixes = [...state.qa.items.filter((i) => i.level === "FAIL").map((i) => `[필수] ${i.msg}`), ...req.map((r) => `[발송 전 필수] ${r}`), ...state.qa.items.filter((i) => i.level === "REVIEW").map((i) => `[확인] ${i.msg}`)];
  L.push(...(fixes.length ? fixes.map((f) => `- ${cell(f)}`) : ["- 없음"]), "");

  L.push("## 미리보기", "");
  L.push(`- HTML: \`site/newsletter/weekly/${state.id}/preview.html\` (이 PR의 Files 탭 → View file, 또는 실행 artifact \`newsletter-weekly-${state.id}\`)`);
  L.push(`- 텍스트: \`site/newsletter/weekly/${state.id}/preview.txt\` · 원고: \`edition.json\` (고치면 해시가 바뀌고 QA를 다시 거칩니다)`);
  L.push(`- 기준: 메인·함께 볼 변화 최소 ${cfg.minStories}건 · 함께 볼 변화 최대 ${cfg.moreMax}건 · 중요도 ${cfg.importantPriority} 이하만 주요 기사 · 같은 회사 최대 ${cfg.maxPerCompany}건 · 발표일 ${cfg.maxEventAgeDays}일 이내`, "");
  if (edition) {
    const mail = renderEditionEmail(edition, { mode: "preview", allStories: stories, config });
    L.push("<details><summary>메일 텍스트 버전 펼치기</summary>", "", "```text", mail.text.slice(0, 20000), "```", "", "</details>", "");
  }
  L.push("## 다음 단계 (사람이 직접)", "");
  L.push("1. 내용 검토 — 고칠 곳은 이 브랜치의 `edition.json`을 고치고 `npm run newsletter:weekly -- --edition " + state.id + "`로 QA를 다시 돌립니다.");
  L.push(`2. 테스트 발송 — \`npm run newsletter:weekly:send -- --edition ${state.id} --test --to <내 주소>\` (지정 주소에만, [테스트] 제목)`);
  L.push(`3. 승인 — \`npm run newsletter:weekly:approve -- --edition ${state.id} --hash ${state.contentHash ? shortHash(state.contentHash) : "<해시>"} --approver <이름>\` (승인 비밀값 필요)`);
  L.push(`4. 발송 — \`npm run newsletter:weekly:send -- --edition ${state.id} --send --confirm ${state.id} --hash <해시> --expect-recipients <N>\` 또는 보호된 'AI마중 뉴스레터 발송' workflow`);
  return L.join("\n") + "\n";
}
