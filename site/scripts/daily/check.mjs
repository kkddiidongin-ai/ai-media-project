#!/usr/bin/env node
/**
 * DAILY 자동화 점검: npm run qa:daily
 * 고정 데이터(fixture)와 가짜 fetch로만 돈다. 외부 사이트·LLM API에 요청하지 않는다.
 * 실제 기사 데이터는 바꾸지 않는다 (승인 시험은 임시 복사본 + AIMAJUNG_ROOT).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.resolve(HERE, "../..");
const REPO = path.resolve(SITE, "..");

// ---------- 가짜 웹 ----------
const WEB = new Map();
const calls = [];
globalThis.fetch = async (input, init = {}) => {
  const url = String(input);
  calls.push({ url, method: init.method ?? "GET", body: init.body });
  const h = WEB.get(url);
  if (typeof h === "function") return h(init);
  if (h) return new Response(h.body, { status: h.status ?? 200, headers: { "content-type": h.type ?? "text/html" } });
  if (url.endsWith("/robots.txt")) return new Response("", { status: 404 });
  return new Response("not found", { status: 404 });
};

const lib = await import("./lib.mjs");
const { runDaily } = await import("./run.mjs");
const { approve } = await import("./approve.mjs");
const providers = await import("./providers.mjs");
const { renderReport } = await import("./report.mjs");
const sel = await import("./select.mjs");
const bt = await import("./backtest.mjs");
const dr = await import("./draft.mjs");

let passed = 0;
let failed = 0;
const t = async (name, fn) => {
  try {
    await fn();
    passed++;
  } catch (e) {
    failed++;
    console.log(`FAIL  ${name}: ${e.message}`);
  }
};
const eq = (a, b, m = "") => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m} 기대 ${JSON.stringify(b)} · 실제 ${JSON.stringify(a)}`);
};
const ok = (v, m) => {
  if (!v) throw new Error(m);
};
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "daily-qa-"));
const quiet = () => {};

// ---------- 고정 데이터 ----------
const DATE = "2026-10-07";
const rss = (items) =>
  `<?xml version="1.0"?><rss><channel>${items.map((i) => `<item><title>${i.title}</title><link>${i.link}</link><pubDate>${i.date}</pubDate><description>${i.desc ?? ""}</description></item>`).join("")}</channel></rss>`;
const LONG_DESC = "Widget 2 is now available to all developers worldwide with a new free tier, 3x faster responses and support for 40 languages starting today in the API.";
const ITEMS_A = [
  { title: "Introducing Widget 2 for developers", link: "https://fx-a.test/news/widget-2", date: "Tue, 07 Oct 2026 09:00:00 GMT", desc: LONG_DESC },
  { title: "Old thing revisited", link: "https://fx-a.test/news/old", date: "Tue, 07 Oct 2026 08:00:00 GMT", desc: "Same URL as an existing story." },
  { title: "How Acme uses Widget to scale customer support", link: "https://fx-a.test/news/acme-story", date: "Mon, 06 Oct 2026 08:00:00 GMT", desc: "A customer story about how Acme uses Widget." },
  { title: "Archive post from September", link: "https://fx-a.test/news/archive", date: "Mon, 01 Sep 2026 08:00:00 GMT", desc: "Out of the window." },
  { title: "Gizmo Pro 3 now generally available in more regions", link: "https://fx-a.test/news/gizmo-ga", date: "Tue, 07 Oct 2026 10:00:00 GMT", desc: "Gizmo Pro 3 is now generally available in 12 more regions, expanding the earlier preview." },
  { title: "Sprocket Engine research results for teams", link: "https://fx-a.test/news/sprocket-engine", date: "Tue, 07 Oct 2026 11:00:00 GMT", desc: "Sprocket Engine research results shared with teams and partners." },
];
const STORIES = [
  { slug: "old-thing", title: "예전 소식", sourceUrl: "https://fx-a.test/news/old", secondarySources: [], sourceTitle: "Old thing", sourceName: "FX A", eventDate: "2026-10-06", products: [] },
  { slug: "gizmo-pro-3-preview", title: "Gizmo Pro 3 프리뷰", sourceUrl: "https://fx-a.test/news/gizmo-preview", secondarySources: [], sourceTitle: "Gizmo Pro 3 preview", sourceName: "FX A", eventDate: "2026-09-20", products: ["Gizmo Pro 3"] },
  { slug: "sprocket-engine-research", title: "Sprocket 엔진 연구", sourceUrl: "https://fx-a.test/news/sprocket-old", secondarySources: [], sourceTitle: "Sprocket Engine research results for partners", sourceName: "FX A", eventDate: "2026-10-01", products: [] },
];
const existing = () => ({ stories: STORIES, candidates: new Map(), editorialIds: new Set(), editorialSlugs: new Set(), topics: ["openai", "ai-coding"] });
const REGISTRY = {
  sources: [
    { id: "fx-a", name: "FX A", feedUrl: "https://fx-a.test/feed.xml", sourceType: "official", tier: 1, fetchMode: "rss", enabled: true },
    { id: "fx-b", name: "FX B", feedUrl: "https://fx-b.test/feed.xml", sourceType: "official", tier: 1, fetchMode: "rss", enabled: true },
    { id: "fx-c", name: "FX C", feedUrl: "https://fx-c.test/feed.xml", sourceType: "official", tier: 1, fetchMode: "rss", enabled: true },
    { id: "fx-off", name: "FX OFF", feedUrl: "https://fx-off.test/feed.xml", sourceType: "official", tier: 1, fetchMode: "rss", enabled: false },
  ],
};
const bodyPage = (sentences) => `<html><head><meta property="article:published_time" content="2026-10-07T09:00:00Z"></head><body><article>${sentences.map((s) => `<p>${s}</p>`).join("")}</article></body></html>`;
const WIDGET_SENTENCES = [
  "Widget 2 is now available to all developers worldwide in the API starting October 7, 2026.",
  "The new free tier includes 1,000 requests per day for every account at no cost.",
  "Responses are 3x faster than Widget 1 in our internal benchmark across 40 languages.",
  "Widget 2 supports 40 languages and adds structured output for agent workflows.",
  "Pricing for the paid tier starts at $20 per month per developer seat.",
  "Existing Widget 1 integrations keep working until March 31, 2027, after which they are retired.",
  "Enterprise customers can request higher limits through their account team.",
];
function resetWeb() {
  WEB.clear();
  WEB.set("https://fx-a.test/feed.xml", { body: rss(ITEMS_A), type: "application/rss+xml" });
  WEB.set("https://fx-b.test/robots.txt", { body: "User-agent: *\nDisallow: /", type: "text/plain" });
  WEB.set("https://fx-b.test/feed.xml", { body: rss([]) });
  WEB.set("https://fx-c.test/feed.xml", { status: 500, body: "boom" });
  WEB.set("https://fx-a.test/news/widget-2", { body: bodyPage(WIDGET_SENTENCES) });
  WEB.set("https://fx-a.test/news/gizmo-ga", { body: bodyPage(["Gizmo Pro 3 is now generally available in 12 more regions.", "It was first released as a preview in September 2026."]) });
}
const ENV = (extra = {}) => ({ DAILY_AUTOMATION_ENABLED: "true", DAILY_MODE: "draft", DAILY_LLM_PROVIDER: "mock", ...extra });
const baseRun = (extra = {}) => ({ date: DATE, out: path.join(tmp, `out-${Math.random().toString(36).slice(2)}`), registry: REGISTRY, existing: existing(), processedFile: path.join(tmp, `p-${Math.random().toString(36).slice(2)}.json`), historyFile: path.join(tmp, `h-${Math.random().toString(36).slice(2)}.json`), queueFile: path.join(tmp, `q-${Math.random().toString(36).slice(2)}.json`), retryDelayMs: 1, log: quiet, ...extra });

// ---------- 1) 수집 ----------
resetWeb();
const limits = lib.loadLimits({});
const col = await lib.collectDaily({ date: DATE, registry: REGISTRY, limits, known: new Map() });

await t("수집: 피드 항목 정규화·발표일 창(기준일-2일~기준일) 밖 제외·짧은 설명만 저장", async () => {
  eq(col.items.length, 5, "창 안 항목 수");
  ok(!col.items.some((i) => i.url.endsWith("/archive")), "창 밖 항목이 들어감");
  const w = col.items.find((i) => i.url.endsWith("/widget-2"));
  eq([w.title, w.sourceId, w.sourceType, w.publishedAt.slice(0, 10)], ["Introducing Widget 2 for developers", "fx-a", "official", "2026-10-07"]);
  ok(w.id === lib.sha ? true : /^[a-f0-9]{12}$/.test(w.id), "fingerprint");
  ok(col.items.every((i) => i.excerpt.length <= 300), "설명 300자 초과");
  ok(col.items.every((i) => !("html" in i) && !("body" in i)), "본문 저장");
});
await t("수집: 소스 상태 success · blocked(robots) · failed(HTTP 500) · skipped(비활성), 한 소스 실패가 전체를 멈추지 않음", async () => {
  const st = Object.fromEntries(col.sources.map((s) => [s.id, s.status]));
  eq(st, { "fx-a": "success", "fx-b": "blocked", "fx-c": "failed", "fx-off": "skipped" });
  ok(col.sources.find((s) => s.id === "fx-c").errors[0].includes("500"), "실패 이유 기록");
});

// ---------- 2) 중복 ----------
await t("중복: 같은 URL → DUPLICATE, 같은 제품 후속(GA) → UPDATE_EXISTING, 비슷한 제목 → UNCERTAIN, 그 외 NEW", async () => {
  const ex = existing();
  const by = (end) => lib.dedupeItem(col.items.find((i) => i.url.endsWith(end)), ex);
  eq([by("/old").result, by("/old").matchSlug], ["DUPLICATE", "old-thing"]);
  eq([by("/gizmo-ga").result, by("/gizmo-ga").matchSlug], ["UPDATE_EXISTING", "gizmo-pro-3-preview"]);
  eq(by("/sprocket-engine").result, "UNCERTAIN");
  eq(by("/widget-2").result, "NEW");
  eq(lib.dedupeItem({ ...col.items[0], id: "abcabcabcabc" }, { ...ex, editorialIds: new Set(["abcabcabcabc"]) }).result, "DUPLICATE", "편집 원고 후보");
  // 플랫폼 이름(버전 없음)만 겹치면 같은 사안으로 보지 않는다
  const platform = { ...ex, stories: [...ex.stories, { slug: "bedrock-x", title: "x", sourceUrl: "https://fx-a.test/news/bedrock-x", secondarySources: [], sourceTitle: "Bedrock X", sourceName: "FX A", eventDate: "2026-10-01", products: ["Amazon Bedrock"] }] };
  eq(lib.dedupeItem({ ...col.items.find((i) => i.url.endsWith("/widget-2")), title: "Build an assistant on Amazon Bedrock", excerpt: "Tutorial using Amazon Bedrock." }, platform).result, "NEW", "플랫폼 이름 오탐");
});

// ---------- 3) 점수 · 판정 · 깊이 ----------
await t("1차 판정: 중복 EXCLUDE · 불확실 HOLD · 사례 글 EXCLUDE · 출시 소식 CANDIDATE · 일자 미상 HOLD · 언론 보도 HOLD", async () => {
  const ex = existing();
  const dec = (end, patch = {}) => {
    const it = { ...col.items.find((i) => i.url.endsWith(end)), ...patch };
    const dup = lib.dedupeItem(it, ex);
    return sel.screenDecision(it, dup, sel.metadataScore(it, dup)).decision;
  };
  eq([dec("/old"), dec("/sprocket-engine"), dec("/acme-story"), dec("/widget-2"), dec("/widget-2", { datePrecision: "month" }), dec("/widget-2", { sourceType: "press" })], ["EXCLUDE", "HOLD", "EXCLUDE", "CANDIDATE", "HOLD", "HOLD"]);
});
const ev = (bodyTexts, grade, status = "OK") => ({ status, grade, chars: 0, ledger: [{ id: "E0", kind: "feed", text: "feed" }, ...bodyTexts.map((t, i) => ({ id: `E${i + 1}`, kind: "body", text: t }))] });
// 서로 다른 사실 문장 (거의 같은 문장은 distinctFacts가 하나로 센다)
const FACT_POOL = [
  "Widget 2 is available in 40 countries starting October 7, 2026.",
  "The free tier includes 1,000 requests per day.",
  "Paid plans start at $20 per month per seat.",
  "Latency dropped by 3x compared with Widget 1 in internal tests.",
  "Enterprise admins get audit logs and SSO through Acme Console.",
  "Widget 1 integrations retire on March 31, 2027.",
  "Partners including Globex and Initech joined the launch program.",
  "Korean language support arrives with the Seoul data region.",
  "The SDK adds Python and TypeScript bindings in version 4.2.",
  "Rate limits rise to 500 requests per minute for verified orgs.",
  "Pricing for batch jobs is 50 percent lower than realtime calls.",
  "Data residency options cover the EU and Japan from day one.",
];
const factsN = (n) => FACT_POOL.slice(0, n);
const S = (o) => ({ importance: 2, practicalImpact: 1, signals: ["PRODUCT_LAUNCH"], ...o });
await t("깊이: DEFAULT STANDARD 없음 — SHORT·STANDARD·DEEP·근거 부족", async () => {
  const NEWd = { result: "NEW" };
  const d = (s2, e) => sel.assessDepth(s2, e, sel.distinctFacts(e), NEWd).depth;
  eq(d(S(), ev(factsN(2), "FAIL")), "SHORT");
  eq(d(S(), ev(factsN(5), "LIMITED")), "STANDARD");
  eq(d(S({ practicalImpact: 0, signals: ["RESEARCH_RESULT"] }), ev(factsN(5), "LIMITED")), "SHORT", "영향·맥락 없으면 STANDARD 아님");
  eq(d(S(), ev(factsN(1), "FAIL")), null, "근거 부족");
  const deepS = S({ importance: 4, practicalImpact: 2, signals: ["PRICING", "PRODUCT_LAUNCH", "AVAILABILITY"] });
  eq(d(deepS, ev(factsN(8), "PASS")), "DEEP");
  eq(sel.assessDepth(deepS, ev(factsN(8), "PASS"), 8, { result: "UPDATE_EXISTING" }).depth, "STANDARD", "후속 업데이트는 DEEP 아님");
  eq(lib.evidenceGrade(2600, 1300), "PASS");
  eq(lib.evidenceGrade(700, 700), "LIMITED");
  eq(lib.evidenceGrade(100, 100), "FAIL");
});
await t("회귀 long page != DEEP: 원문이 길고 확인 사실이 많아도 중요도·맥락이 없으면 DEEP 아님", async () => {
  const howto = { importance: 1, practicalImpact: 1, signals: ["API_PLATFORM"] };
  const r = sel.assessDepth(howto, ev(factsN(12), "PASS"), 12, { result: "NEW" });
  ok(r.depth !== "DEEP", `깊이 ${r.depth}`);
  ok(r.deepMissing.includes("importance") && r.deepMissing.includes("contextNeed"), JSON.stringify(r.deepMissing));
});
await t("회귀 accessible source != importance: 원문 접근 여부·출처 등급은 중요도·우선순위를 바꾸지 않음", async () => {
  const it = col.items.find((i) => i.url.endsWith("/widget-2"));
  const a = sel.metadataScore(it, { result: "NEW" });
  const b = sel.metadataScore({ ...it, tier: 3, sourceType: "official" }, { result: "NEW" });
  eq([a.importance, a.priority], [b.importance, b.priority], "출처 등급");
  ok(a.sourceQuality !== b.sourceQuality, "출처 품질은 따로 기록");
});

// ---------- 4) 검증 ----------
const EVID = { status: "OK", pageDate: null, ledger: [{ id: "E1", kind: "body", text: "Widget 2 is now available worldwide with 1,000 free requests per day and support for 40 languages." }, { id: "E2", kind: "body", text: "The paid tier starts at $20 per month." }] };
const goodDraft = () => ({
  title: "Widget 2 출시, 하루 1,000회 무료 요청",
  summary: "FX A가 Widget 2를 전 세계 개발자에게 공개했습니다.",
  category: "PRODUCT_UPDATE",
  topics: ["ai-coding"],
  facts: [{ text: "Widget 2는 하루 1,000회 무료 요청과 40개 언어를 지원합니다.", evidence: ["E1"] }, { text: "유료 요금제는 월 $20부터입니다.", evidence: ["E2"] }],
  why: { text: "무료 구간이 생겨 개발자가 바로 써 볼 수 있습니다.", evidence: ["E1"] },
  change: { text: "개발자는 추가 비용 없이 하루 1,000회까지 쓸 수 있습니다.", evidence: ["E1"] },
  editorialDepth: "SHORT",
});
const vctx = { item: { publishedAt: "2026-10-07T09:00:00Z" }, evidence: EVID, existing: existing(), dup: { result: "NEW" } };
await t("검증: 근거와 맞는 원고는 오류·확인 항목 없음", async () => {
  eq(lib.validateDraft(goodDraft(), vctx), { errors: [], needsReview: [] });
});
await t("검증: 근거에 없는 숫자·가격·이름·GA 표현·회사 주장·상대 날짜·근거 id 누락을 잡음", async () => {
  const d = goodDraft();
  d.facts[0].text = "Widget 2는 하루 5,000회 무료 요청을 제공합니다.";
  eq(lib.validateDraft(d, vctx).needsReview.includes("numeric_claim"), true, "숫자");
  const p = goodDraft();
  p.facts[1].text = "유료 요금제는 월 30달러부터입니다.";
  ok(lib.validateDraft(p, vctx).needsReview.includes("price_unsupported") || lib.validateDraft(p, vctx).needsReview.includes("numeric_claim"), "가격");
  const n = goodDraft();
  n.summary = "FX A가 Widget 3X를 공개했습니다.";
  ok(lib.validateDraft(n, vctx).needsReview.includes("unsupported_name"), "이름");
  const ga = goodDraft();
  ga.summary = "Widget 2가 정식 출시됐습니다.";
  ok(lib.validateDraft(ga, { ...vctx, evidence: { ...EVID, ledger: [...EVID.ledger, { id: "E3", kind: "body", text: "Widget 2 is in limited preview." }] } }).needsReview.includes("rollout_uncertain"), "GA");
  const sup = goodDraft();
  sup.why.text = "업계 최고 수준의 속도를 냅니다.";
  ok(lib.validateDraft(sup, vctx).needsReview.includes("company_claim_unattributed"), "회사 주장");
  const att = goodDraft();
  att.why.text = "FX A는 업계 최고 수준의 속도라고 밝혔습니다.";
  ok(!lib.validateDraft(att, vctx).needsReview.includes("company_claim_unattributed"), "출처 밝힌 주장은 통과");
  const rel = goodDraft();
  rel.summary = "오늘 Widget 2가 공개됐습니다.";
  ok(lib.validateDraft(rel, vctx).needsReview.includes("relative_date"), "상대 날짜");
  const noev = goodDraft();
  noev.facts[0].evidence = [];
  ok(lib.validateDraft(noev, vctx).errors.some((e) => e.includes("facts[0]")), "근거 id 누락은 오류");
  const deep = goodDraft();
  deep.editorialDepth = "DEEP";
  ok(lib.validateDraft(deep, vctx).errors.some((e) => e.includes("SHORT·STANDARD")), "자동 원고 DEEP 금지");
  const kr = goodDraft();
  kr.change.text = "한국에서도 바로 사용할 수 있습니다.";
  ok(lib.validateDraft(kr, vctx).needsReview.includes("korea_claim_unsupported"), "근거 없는 한국 출시");
  const blocked = lib.validateDraft(goodDraft(), { ...vctx, evidence: { ...EVID, status: "HTTP_403" } });
  ok(blocked.needsReview.includes("source_blocked"), "원문 차단");
});

// ---------- 5) 공급자 (재시도 · 상한 · 키 없음) ----------
await t("원고 생성: 키 없으면 생성하지 않고 skipped (가짜 원고 없음)", async () => {
  eq(providers.resolveProvider({}), "none");
  eq(providers.resolveProvider({ ANTHROPIC_API_KEY: "x" }), "anthropic");
  eq(providers.resolveProvider({ ANTHROPIC_API_KEY: "x", DAILY_LLM_PROVIDER: "none" }), "none");
  const r = await providers.generateArticle({ title: "t" }, { ledger: [] }, { provider: "none" });
  eq([r.status, r.draft], ["skipped", undefined]);
});
await t("원고 생성: 5xx는 retries번까지만 다시 시도, 4xx는 다시 시도 안 함, 하루 호출 상한", async () => {
  let n = 0;
  const lim = { ...lib.DEFAULTS, llmRetries: 1, maxLlmCalls: 6 };
  const mk = (status) => ({ provider: "anthropic", env: { ANTHROPIC_API_KEY: "sk-test-not-real" }, limits: lim, budget: { calls: 0, inputTokens: 0, outputTokens: 0 }, categories: [], topics: [], suggestedDepth: "SHORT", retryDelayMs: 1, fetch: async () => (n++, new Response("{}", { status })) });
  const cand = { title: "t", sourceName: "s", url: "https://x.test", publishedAt: "2026-10-07T00:00:00Z" };
  n = 0;
  const r5 = await providers.generateArticle(cand, { ledger: [] }, mk(503));
  eq([r5.status, n], ["failed", 2], "5xx");
  n = 0;
  const r4 = await providers.generateArticle(cand, { ledger: [] }, mk(401));
  eq([r4.status, n], ["failed", 1], "4xx");
  const ctx = mk(503);
  ctx.budget.calls = 6;
  n = 0;
  const cap = await providers.generateArticle(cand, { ledger: [] }, ctx);
  eq([cap.status, n], ["skipped", 0], "상한");
  ok(!JSON.stringify([r5, r4, cap]).includes("sk-test"), "키가 결과에 나옴");
});
await t("비용 상한: 환경변수로 HARD_CAPS를 넘길 수 없음", async () => {
  const l = lib.loadLimits({ DAILY_MAX_PUBLISH: "999", DAILY_MAX_LLM_CALLS: "500", DAILY_LLM_RETRIES: "9", DAILY_MAX_EVIDENCE_FETCHES: "999" });
  // Phase 7.2: 배치 크기의 안전 상한 (요청·비용 보호). 발행 추천 총량은 기본 0 = 상한 없음
  eq([l.maxPublishPerDay, l.maxLlmCalls, l.llmRetries, l.maxEvidenceFetches], [999, 200, 2, 200]);
  eq(lib.loadLimits({ DAILY_MAX_PUBLISH: "5000", DAILY_MAX_EVIDENCE_FETCHES: "5000" }).maxEvidenceFetches, 200, "근거 확인 배치 하드 상한");
  const d = lib.loadLimits({});
  eq([d.maxPublishPerDay, d.maxEvidenceFetches, d.maxLlmCalls, d.windowDays], [0, 40, 6, 3], "기본값 (0 = 발행 추천 상한 없음, 72시간 재확인)");
  eq(lib.loadLimits({ DAILY_MAX_CANDIDATES: "2" }).maxPublishPerDay, 2, "7.1 이름 호환");
});

// ---------- 6) 전체 실행 ----------
await t("킬 스위치: DAILY_AUTOMATION_ENABLED가 true가 아니면 아무것도 하지 않음 (요청·파일 0)", async () => {
  for (const v of [undefined, "false", "0", "yes", ""]) {
    resetWeb();
    calls.length = 0;
    const opt = baseRun({ env: v === undefined ? {} : { DAILY_AUTOMATION_ENABLED: v } });
    const r = await runDaily(opt);
    eq(r.status, "DISABLED", String(v));
    eq(calls.length, 0, "요청");
    ok(!fs.existsSync(opt.out), "파일 생성");
  }
});
let fullOpt;
let full;
await t("전체 실행(mock): 수집→중복→판정→근거→원고→검증→대기열·보고서, 실패 소스 있으면 PARTIAL", async () => {
  resetWeb();
  fullOpt = baseRun({ env: ENV() });
  full = await runDaily(fullOpt);
  eq(full.status, "PARTIAL", "fx-b blocked·fx-c failed");
  const c = full.run.counts;
  eq([c.collected, c.NEW, c.UPDATE_EXISTING, c.DUPLICATE, c.UNCERTAIN], [5, 2, 1, 1, 1]);
  const dir = path.join(fullOpt.out, DATE);
  ok(fs.existsSync(path.join(dir, "run.json")) && fs.existsSync(path.join(dir, "report.md")), "run.json·report.md");
  const q = JSON.parse(fs.readFileSync(path.join(dir, "candidates", `${col.items.find((i) => i.url.endsWith("/widget-2")).id}.json`), "utf8"));
  for (const k of ["proposedSlug", "title", "depth", "category", "summary", "body", "sources", "evidence", "score", "decision", "needsReview", "duplicate", "approval"]) ok(k in q, `대기열 항목 ${k}`);
  eq([q.generation.provider, q.approval.status], ["mock", "pending"]);
  ok(q.evidence.ledger.every((e) => e.sourceUrl && e.source && e.publishedAt && e.checkedAt && e.text.length <= 280), "근거 장부 항목");
  ok(!JSON.stringify(q).includes("<p>"), "HTML 저장");
  eq(full.run.llm.calls, c.drafts, "LLM 호출 수");
});
await t("같은 날짜 재실행: 원고를 다시 만들지 않음 (LLM 호출 0)·결과 같음", async () => {
  resetWeb();
  const again = await runDaily({ ...fullOpt });
  eq(again.run.llm.calls, 0);
  eq(again.run.counts, full.run.counts);
});
await t("다음 날 실행: 이미 다룬 URL은 다시 생성하지 않음 (HOLD·carriedFrom)", async () => {
  resetWeb();
  const next = await runDaily({ ...fullOpt, date: "2026-10-08", out: path.join(tmp, "next") });
  const w = next.run.items.find((i) => i.url.endsWith("/widget-2"));
  eq([w.decision, w.carriedFrom], ["HOLD", DATE]);
  eq(next.run.llm.calls, 0);
});
await t("회귀 final publish cap: 상한은 근거 확인 '뒤' 최종 추천에만 — DAILY_MAX_PUBLISH=1이면 근거는 여러 건 보고 추천만 1건", async () => {
  resetWeb();
  const r = await runDaily(baseRun({ env: ENV({ DAILY_MAX_PUBLISH: "1" }) }));
  ok(r.run.counts.evidenceChecked >= 2, `근거 확인 ${r.run.counts.evidenceChecked}건`);
  eq(r.run.counts.PUBLISH, 1);
  ok(r.run.items.some((i) => i.capStage === "final" && i.reasons.some((x) => x.includes("최종 발행 추천 상한"))), "최종 상한 사유");
  ok(!r.run.items.some((i) => i.capStage === "evidence"), "근거 확인 전에 잘림");
  ok(fs.readFileSync(path.join(r.outDir, "report.md"), "utf8").includes("## 선정 진단 (Selection Diagnostics)"), "진단 섹션");
});
await t("뉴스 없는 날: 0건도 정상 (SUCCESS, 발행 추천 0, 보고서에 안내)", async () => {
  WEB.clear();
  WEB.set("https://fx-a.test/feed.xml", { body: rss([]) });
  const reg = { sources: [REGISTRY.sources[0]] };
  const r = await runDaily(baseRun({ env: ENV(), registry: reg }));
  eq([r.status, r.run.counts.collected, r.run.counts.PUBLISH], ["SUCCESS", 0, 0]);
  ok(fs.readFileSync(path.join(r.outDir, "report.md"), "utf8").includes("0건도 정상"), "보고서 안내");
});
await t("모든 소스 실패: FAILED", async () => {
  WEB.clear();
  WEB.set("https://fx-c.test/feed.xml", { status: 500, body: "x" });
  const r = await runDaily(baseRun({ env: ENV(), registry: { sources: [REGISTRY.sources[2]] } }));
  eq(r.status, "FAILED");
});
await t("원문 차단 소스: 근거 부족이면 발행 추천하지 않음 (HOLD·insufficient_evidence/source_blocked)", async () => {
  resetWeb();
  // robots.txt 결과는 호스트별로 캐시되므로 이 시험은 다른 호스트를 쓴다
  WEB.set("https://fx-r.test/robots.txt", { body: "User-agent: *\nDisallow: /news/", type: "text/plain" });
  WEB.set("https://fx-r.test/feed.xml", { body: rss([{ ...ITEMS_A[0], link: "https://fx-r.test/news/widget-2", desc: "Short." }]) });
  WEB.set("https://fx-r.test/news/widget-2", { body: bodyPage(WIDGET_SENTENCES) });
  const r = await runDaily(baseRun({ env: ENV(), registry: { sources: [{ ...REGISTRY.sources[0], id: "fx-r", name: "FX R", feedUrl: "https://fx-r.test/feed.xml" }] } }));
  const it = r.run.items[0];
  ok(it.decision !== "PUBLISH", `판정 ${it.decision}`);
});
await t("보고서: 상태·숫자표·발행 추천·보류·제외·소스 상태·비용이 들어감", async () => {
  const md = fs.readFileSync(path.join(fullOpt.out, DATE, "report.md"), "utf8");
  for (const s of ["# AI마중 DAILY — 2026-10-07", "**상태: PARTIAL", "## 발행 추천", "## 보류", "## 제외", "## 소스 상태", "| FX B | **FAILED** |", "| FX C | **FAILED** |", "요청 실패 (blocked", "요청 실패 (failed", "## 비용", "자동으로 발행하지 않습니다"]) ok(md.includes(s), `보고서에 '${s}' 없음`);
  const summaryPart = md.replace(/## AI 초안[\s\S]*?(?=## 보류)/, "");
  ok(summaryPart.split("\n").length < 120, "보고서가 너무 김");
  ok(md.length < 60_000, "PR 본문 한도");
  ok(renderReport({ ...full.run, counts: { ...full.run.counts } }, []).includes("0건도 정상"), "빈 대기열");
});

// ---------- 6-2) 2026-10-07 실제 메타데이터 회귀 (외부 요청 없음) ----------
const FX107 = JSON.parse(fs.readFileSync(path.join(HERE, "fixtures/2026-10-07-metadata.json"), "utf8")).items;
const NEWdup = { result: "NEW" };
const scored = FX107.map((i) => {
  const s2 = sel.metadataScore(i, NEWdup);
  return { i, s: s2, d: sel.screenDecision(i, NEWdup, s2).decision };
});
const find = (re) => {
  const x = scored.find((r) => re.test(r.i.title));
  if (!x) throw new Error(`fixture 없음: ${re}`);
  return x;
};
await t("회귀 OpenAI–Atlassian early-cap: 근거 확인 명단(기본 상한 12) 안에 들고, 사용법·고객 사례보다 우선", async () => {
  const atl = find(/^Atlassian and OpenAI/);
  eq(atl.d, "CANDIDATE");
  const shortlist = scored.filter((r) => r.d === "CANDIDATE").sort((a, b) => b.s.priority - a.s.priority).slice(0, lib.DEFAULTS.maxEvidenceFetches);
  ok(shortlist.includes(atl), `명단 밖 (우선순위 ${atl.s.priority})`);
  for (const r of scored.filter((x) => ["HOW_TO", "CUSTOMER_STORY", "INDUSTRY_STORY"].includes(x.s.contentType))) ok(atl.s.priority > r.s.priority, `${r.i.title.slice(0, 40)} (${r.s.priority}) ≥ Atlassian (${atl.s.priority})`);
});
await t("회귀 vendor how-to penalty: AWS 사용법 글은 감점·제외, 실제 기능 변화(can now·지역 제공)가 있으면 제외하지 않음", async () => {
  for (const re of [/^Build a voice travel concierge/, /^Agentic retrieval with LangChain/, /^Downgrading user roles/, /^Best practices for Amazon SageMaker HyperPod/, /^Building a context-aware AI assistant/, /^Evaluating multi-agent systems/]) {
    const x = find(re);
    eq([x.s.contentType, x.d], ["HOW_TO", "EXCLUDE"], x.i.title.slice(0, 40));
  }
  ok(find(/^Supercharge regulated workloads/).d !== "EXCLUDE", "GovCloud 제공(강한 신호)은 제외하지 않음");
  ok(find(/^Manage Amazon SageMaker HyperPod Spaces/).s.priority < sel.PUBLISH_MIN, "작은 기능 변화는 발행 추천 기준 미달");
});
await t("회귀 customer story penalty: 고객·업계 사례는 제외", async () => {
  for (const re of [/^How Jump Trading/, /^Advancing computer use with Ironclad/, /^From Scan to Treatment Plan/, /^Ask a Scientist/, /^Making global public health/]) eq(find(re).d, "EXCLUDE", re.source);
});
await t("회귀 major product event priority: SynthID·EmbeddingGemma 2·Cyber Verification은 발행 추천 기준 이상, 사용법 글보다 위", async () => {
  for (const re of [/^We're making it easier to identify AI-generated/, /^EmbeddingGemma 2/, /^Expanding the Cyber Verification Program/, /^Sharing AI progress in mathematics/]) {
    const x = find(re);
    eq(x.d, "CANDIDATE", x.i.title.slice(0, 40));
    ok(x.s.priority >= sel.PUBLISH_MIN, `${x.i.title.slice(0, 40)} 우선순위 ${x.s.priority}`);
  }
});
await t("회귀 2026-10-07 재실행에서 찾은 오류: 'How …' 고객 사례 · 사용법 글의 'security test'는 DEEP 맥락 아님", async () => {
  const corner = { title: "How Cornerstone OnDemand cut database diagnosis by 78% with Amazon Bedrock", excerpt: "", sourceId: "aws-ml", sourceType: "official", tier: 1 };
  eq(sel.classifyType(corner).type, "CUSTOMER_STORY");
  eq(sel.screenDecision(corner, NEWdup, sel.metadataScore(corner, NEWdup)).decision, "EXCLUDE");
  const glm = find(/^Introducing GLM 5\.3/);
  ok(!glm.s.signals.includes("SECURITY"), `일반 'security' 언급이 보안 사건으로 잡힘: ${glm.s.signals}`);
  const r = sel.assessDepth(glm.s, ev(factsN(11), "PASS"), 11, NEWdup);
  ok(r.depth !== "DEEP", "플랫폼 모델 제공 글이 DEEP");
  ok(find(/^Expanding the Cyber Verification Program/).s.signals.includes("SECURITY"), "사이버 검증 프로그램은 보안 사건");
  ok(find(/^We're making it easier to identify AI-generated/).s.signals.includes("SECURITY"), "AI 생성물 식별은 보안·출처 신호");
});
await t("회귀 같은 날 다른 출처의 같은 발표: 하나만 근거·추천, 나머지는 DUPLICATE(alsoAt 기록)", async () => {
  WEB.clear();
  const twin = (host, src) => ({ ...REGISTRY.sources[0], id: src, name: src.toUpperCase(), feedUrl: `https://${host}/feed.xml` });
  WEB.set("https://fx-t1.test/feed.xml", { body: rss([{ title: "Introducing Widget 2 for developers", link: "https://fx-t1.test/news/widget-2", date: "Tue, 07 Oct 2026 09:00:00 GMT", desc: LONG_DESC }]) });
  WEB.set("https://fx-t2.test/feed.xml", { body: rss([{ title: "Introducing Widget 2 for developers", link: "https://fx-t2.test/blog/widget-2", date: "Tue, 07 Oct 2026 10:00:00 GMT", desc: LONG_DESC }]) });
  WEB.set("https://fx-t1.test/news/widget-2", { body: bodyPage(WIDGET_SENTENCES) });
  WEB.set("https://fx-t2.test/blog/widget-2", { body: bodyPage(WIDGET_SENTENCES) });
  const r = await runDaily(baseRun({ env: ENV(), registry: { sources: [twin("fx-t1.test", "t1"), twin("fx-t2.test", "t2")] } }));
  eq([r.run.counts.PUBLISH, r.run.counts.DUPLICATE, r.run.counts.evidenceChecked], [1, 1, 1]);
  const pub = JSON.parse(fs.readFileSync(path.join(r.outDir, "candidates", fs.readdirSync(path.join(r.outDir, "candidates"))[0]), "utf8"));
  eq(pub.alsoAt.length, 1);
});
await t("회귀 press only: 언론 보도는 공식 확인 전까지 HOLD (발행 추천 아님)", async () => {
  const x = find(/^OpenAI agents tried to hack Wikipedia/);
  eq(x.d, "HOLD");
});
await t("회귀 same-company soft diversity: 같은 회사 3번째는 다른 회사 후보에 양보, 다른 후보가 없거나 훨씬 약하면 그대로", async () => {
  const mk = (company, priority, facts = 5) => ({ company, facts, score: { priority } });
  const g = [mk("Google", 10), mk("Google", 9), mk("Google", 9), mk("Google", 8)];
  const o = mk("OpenAI", 7);
  const a = sel.finalSelect([...g, o], { maxPublish: 3 });
  eq(a.picked.map((x) => x.company), ["Google", "Google", "OpenAI"]);
  eq(a.diversityDeferred.map((x) => x.score.priority), [9, 8], "3·4번째 Google은 다양성으로 뒤로");
  const only = sel.finalSelect(g, { maxPublish: 3 });
  eq(only.picked.map((x) => x.company), ["Google", "Google", "Google"], "한 회사에 몰린 날은 억지로 끼우지 않음");
  const strong = sel.finalSelect([mk("Google", 14), mk("Google", 13), mk("Google", 12), mk("OpenAI", 6)], { maxPublish: 3 });
  eq(strong.picked.map((x) => x.score.priority), [14, 13, 12], "훨씬 중요한 같은 회사 기사는 우선");
});

// ---------- 6-3) Phase 7.1.2: Shadow Mode · 대체 근거 · 백테스트 ----------
await t("Shadow Mode: 키·anthropic 설정이 있어도 LLM 호출 0, 보고서에 Shadow 표시, 원고 없음은 실패로 치지 않음", async () => {
  resetWeb();
  let llm = 0;
  const r = await runDaily(baseRun({ env: ENV({ DAILY_MODE: "shadow", DAILY_LLM_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "sk-test-not-real" }), registry: { sources: [REGISTRY.sources[0]] }, fetch: async () => (llm++, new Response("{}", { status: 500 })) }));
  eq([llm, r.run.llm.calls, r.run.provider, r.run.mode], [0, 0, "none", "shadow"]);
  eq(r.status, "SUCCESS", "소스 정상이면 원고가 없어도 SUCCESS");
  ok(r.run.counts.PUBLISH >= 1, "선정은 그대로");
  const md = fs.readFileSync(path.join(r.outDir, "report.md"), "utf8");
  ok(md.includes("Shadow Mode") && !md.includes("sk-test"), "Shadow 표시·키 노출");
});
await t("OpenAI 대체 근거: 원문 403이면 공식 API 변경 기록에서 '버전 붙은 이름'이 나오는 줄만 근거(확인 필요 표시), 이름이 없으면 HOLD", async () => {
  WEB.clear();
  const oa = { ...REGISTRY.sources[0], id: "openai", name: "OpenAI", feedUrl: "https://openai.com/news/rss.xml" };
  WEB.set("https://openai.com/news/rss.xml", { body: rss([
    { title: "Introducing GPT-6.1 Sol for professional work", link: "https://openai.com/index/gpt-6-1-sol", date: "Tue, 07 Oct 2026 09:00:00 GMT", desc: "GPT-6.1 Sol is now available in the API for complex coding at a lower price than GPT-6 Astra." },
    { title: "Atlassian and OpenAI expand partnership to turn enterprise knowledge into action", link: "https://openai.com/index/atlassian", date: "Tue, 07 Oct 2026 08:00:00 GMT", desc: "Atlassian and OpenAI are expanding their partnership to connect frontier models with enterprise knowledge." },
  ]) });
  WEB.set("https://openai.com/index/gpt-6-1-sol", { status: 403, body: "" });
  WEB.set("https://openai.com/index/atlassian", { status: 403, body: "" });
  WEB.set("https://platform.openai.com/docs/changelog", { body: bodyPage(["Released GPT-6.1 Sol ( gpt-6.1-sol ) for complex coding and professional work at a lower cost than GPT-6 Astra.", "GPT-6.1 Sol also supports Multi-agent in beta in the Responses API for delegating work.", "Fixed a bug in image encoding that degraded image understanding in older snapshots."]) });
  const r = await runDaily(baseRun({ env: ENV({ DAILY_MODE: "shadow" }), registry: { sources: [oa] } }));
  const qdir = path.join(r.outDir, "candidates");
  const qs = fs.readdirSync(qdir).map((f) => JSON.parse(fs.readFileSync(path.join(qdir, f), "utf8")));
  const sol = qs.find((q) => /GPT-6\.1/.test(q.sourceTitle));
  const atl = qs.find((q) => /Atlassian/.test(q.sourceTitle));
  ok(sol && atl, "두 항목 모두 근거 확인");
  eq([sol.evidence.status, sol.evidence.alternate.matched], ["HTTP_403", 2]);
  ok(sol.evidence.ledger.some((e) => e.kind === "alternate" && e.sourceUrl === "https://platform.openai.com/docs/changelog" && e.publishedAt === null), "대체 근거 출처·날짜 없음 표시");
  ok(sol.needsReview.includes("alternate_evidence") && sol.needsReview.includes("source_blocked"), JSON.stringify(sol.needsReview));
  ok(sol.suggestedDepth !== "STANDARD" && sol.suggestedDepth !== "DEEP", `대체 근거만으로 깊이 ${sol.suggestedDepth}`);
  eq([atl.decision, atl.evidence.alternate.matched], ["HOLD", 0]);
  ok(atl.needsReview.includes("insufficient_evidence"), "근거 부족");
});
await t("회귀 제품 이름 접두어: 'Claude Sonnet 5' 기사와 'Claude Sonnet 5.5' 발표는 같은 사안으로 보지 않음", async () => {
  ok(!lib.mentionsProduct("Claude Opus 5.5 and Claude Sonnet 5.5 are available", "Claude Sonnet 5"), "5 vs 5.5");
  ok(lib.mentionsProduct("New Claude Sonnet 5 pricing", "Claude Sonnet 5"), "같은 버전");
  ok(!lib.mentionsProduct("Gizmo Pro 30 launched", "Gizmo Pro 3"), "3 vs 30");
  const ex = { ...existing(), stories: [{ slug: "claude-sonnet-5", title: "x", sourceUrl: "https://a.test/s5", secondarySources: [], sourceTitle: "Claude Sonnet 5", sourceName: "Anthropic", eventDate: "2026-09-20", products: ["Claude Sonnet 5"] }] };
  const it = { id: "aaaaaaaaaaaa", url: "https://b.test/x", canonicalUrl: "https://b.test/x", title: "Supercharge regulated workloads with Claude Code and Amazon Bedrock", excerpt: "Anthropic Claude Opus 5.5 and Claude Sonnet 5.5 are available on Amazon Bedrock in the AWS GovCloud (US) Regions.", publishedAt: "2026-10-05T10:00:00Z", sourceName: "AWS" };
  eq(lib.dedupeItem(it, ex).result, "NEW");
});
await t("백테스트: 실행 시각(D-1 22:00 UTC) 이전 발표만·창 밖 제외·스냅숏 없는 날 표시, D 이전 사람 발행만 기존 기사", async () => {
  const snapshot = { capturedAt: "2026-10-07T15:30:00Z", window: { since: "2026-10-05" }, items: [
    { id: "s1", url: "https://x.test/1", title: "A", excerpt: "", publishedAt: "2026-10-05T10:00:00Z" },
    { id: "s2", url: "https://x.test/2", title: "B", excerpt: "", publishedAt: "2026-10-06T23:00:00Z" },
  ] };
  const a = bt.itemsAsOf("2026-10-07", { snapshot, candidates: new Map([["c1", { id: "c1", url: "https://x.test/c1", title: "C", description: "", publishedAt: "2026-10-04T05:00:00Z" }]]) });
  eq(a.items.map((i) => i.id), ["s1"], "실행 시각 뒤 발표·창 밖 제외");
  eq(a.runTime, "2026-10-06T22:00:00.000Z");
  const b = bt.itemsAsOf("2026-10-06", { snapshot, candidates: new Map([["c1", { id: "c1", url: "https://x.test/c1", title: "C", description: "", publishedAt: "2026-10-04T05:00:00Z" }]]) });
  eq([b.items.map((i) => i.origin), b.coverage.uncoveredDays], [["snapshot", "candidates"], ["2026-10-04"]]);
  const full = { stories: [{ slug: "p", publishedAt: "2026-10-06", candidateId: "s1", secondarySources: [] }, { slug: "q", publishedAt: "2026-10-05", candidateId: "zz", secondarySources: [] }] };
  eq(bt.existingAsOf("2026-10-06", full).stories.map((s) => s.slug), ["q"], "D 당일 발행분은 아직 없던 기사");
});
await t("백테스트 평가: 발표 전 NOT_YET · 이미 사람 발행 DUP_OK/DUP_MISSED · 추천 RECOMMENDED · 사람 미발행 추천 목록", async () => {
  const full = { stories: [
    { slug: "later", eventDate: "2026-10-06", sourcePublishedAt: "2026-10-06T23:00:00Z", publishedAt: "2026-10-07", candidateId: "l1", sourceUrl: "https://x.test/l1" },
    { slug: "already", eventDate: "2026-10-05", sourcePublishedAt: "2026-10-05T01:00:00Z", publishedAt: "2026-10-05", candidateId: "a1", sourceUrl: "https://x.test/a1" },
    { slug: "rec", eventDate: "2026-10-06", sourcePublishedAt: "2026-10-06T01:00:00Z", publishedAt: "2026-10-07", candidateId: "r1", sourceUrl: "https://x.test/r1" },
  ] };
  const run = { items: [
    { id: "a1", url: "https://x.test/a1", duplicate: "DUPLICATE", decision: "EXCLUDE", reasons: [] },
    { id: "r1", url: "https://x.test/r1", duplicate: "NEW", decision: "PUBLISH", stage: "evidence", reasons: [] },
    { id: "x9", url: "https://x.test/x9", duplicate: "NEW", decision: "PUBLISH", stage: "evidence", reasons: [], title: "Extra", source: "S" },
  ] };
  const ev = bt.evaluate("2026-10-07", run, full, { since: "2026-10-05", runTime: "2026-10-06T22:00:00.000Z", items: [] });
  eq(ev.truth.map((x) => x.outcome), ["NOT_YET", "DUP_OK", "RECOMMENDED"]);
  eq(ev.recall, { recommended: 1, shortlisted: 1, of: 1 });
  eq(ev.recommendedNotPublishedByHuman.map((x) => x.title), ["Extra"]);
});

// ---------- 6-4) 2026-10-11 Hotfix 회귀 ----------
await t("회귀 2026-10-11: GitHub이 없는 Variable을 빈 문자열로 넘겨도 상한은 기본값 (0이 되지 않음)", async () => {
  const l = lib.loadLimits({ DAILY_MAX_PUBLISH: "", DAILY_MAX_EVIDENCE_FETCHES: "", DAILY_MAX_LLM_CALLS: " " });
  eq([l.maxPublishPerDay, l.maxEvidenceFetches, l.maxLlmCalls], [0, 40, 6]);
  eq(lib.loadLimits({ DAILY_MAX_PUBLISH: "abc" }).maxPublishPerDay, 0, "숫자가 아닌 값 → 기본(상한 없음)");
  eq(lib.loadLimits({ DAILY_MAX_EVIDENCE_FETCHES: "0" }).maxEvidenceFetches, 0, "명시한 0은 그대로");
  eq(lib.loadLimits({ DAILY_MAX_PUBLISH: "", DAILY_MAX_CANDIDATES: "2" }).maxPublishPerDay, 2, "빈 새 이름이면 예전 이름");
});
await t("회귀 2026-10-11: 워크플로와 같은 환경(빈 Variable·Shadow)에서도 근거 확인·검토용 추천이 실제로 이뤄짐", async () => {
  resetWeb();
  const r = await runDaily(baseRun({ env: ENV({ DAILY_MODE: "shadow", DAILY_LLM_PROVIDER: "none", DAILY_MAX_PUBLISH: "", DAILY_MAX_EVIDENCE_FETCHES: "" }), registry: { sources: [REGISTRY.sources[0]] } }));
  eq([r.run.limits.maxPublishPerDay, r.run.limits.maxEvidenceFetches], [0, 40]);
  ok(r.run.counts.evidenceChecked >= 1 && r.run.counts.PUBLISH >= 1, JSON.stringify(r.run.counts));
  eq([r.status, r.run.limitWarnings, r.run.llm.calls], ["SUCCESS", undefined, 0]);
  ok(fs.readFileSync(path.join(r.outDir, "report.md"), "utf8").includes("편집자 검토용"), "검토용 추천 표시");
});
await t("근거 확인 배치를 0으로 두면 조용히 SUCCESS가 아니라 경고 + 미완료(대기열)", async () => {
  resetWeb();
  const r = await runDaily(baseRun({ env: ENV({ DAILY_MODE: "shadow", DAILY_MAX_EVIDENCE_FETCHES: "0" }), registry: { sources: [REGISTRY.sources[0]] } }));
  eq(r.status, "INCOMPLETE");
  ok(r.run.pipeline.pending.evidence >= 1, "대기열에 남음");
  ok(r.run.limitWarnings?.[0]?.includes("maxEvidenceFetches"), JSON.stringify(r.run.limitWarnings));
  ok(fs.readFileSync(path.join(r.outDir, "report.md"), "utf8").includes("설정 경고"), "보고서 경고");
});
await t("회귀 2026-10-11 Asana: 발췌에만 지나가듯 나온 모델(GPT-6 Astra)로 같은 사안 판정하지 않음, 제목이 주제일 때만", async () => {
  const astra = { slug: "chatgpt-for-financial-services", title: "'ChatGPT for Financial Services'… 금융 데이터 내장, GPT-6 Astra 기반", sourceUrl: "https://a.test/fs", secondarySources: [], sourceTitle: "Introducing ChatGPT for Financial Services", sourceName: "OpenAI", eventDate: "2026-09-10", products: ["ChatGPT for Financial Services", "GPT-6 Astra"] };
  const ex = { ...existing(), stories: [astra] };
  const asana = { id: "a5a5a5a5a5a5", url: "https://openai.com/index/asana-browser-agent", canonicalUrl: "https://openai.com/index/asana-browser-agent", title: "Asana cuts model costs 76x in browser tests with GPT-6.1 Sol", excerpt: "Using GPT-6 Astra in Codex, Asana made its browser agent 76x cheaper and 5x faster in tests to offer customers more capable models.", publishedAt: "2026-10-09T15:00:00Z", sourceId: "openai", sourceName: "OpenAI", sourceType: "official", tier: 1 };
  const dup = lib.dedupeItem(asana, ex);
  eq(dup.result, "NEW", `판정 ${dup.result} ${dup.reason}`);
  eq(sel.screenDecision(asana, dup, sel.metadataScore(asana, dup)).decision, "EXCLUDE", "고객 사례는 제외");
  // 제목이 그 제품을 다루면 여전히 같은 사안 후보
  const about = { ...asana, id: "b6b6b6b6b6b6", title: "GPT-6 Astra now available in more regions", excerpt: "GPT-6 Astra is now available in 12 more regions." };
  eq(lib.dedupeItem(about, ex).result, "UPDATE_EXISTING");
  // 저가치 유형은 중복 불확실이어도 사람 검토 대신 제외
  const story = { ...asana, id: "c7c7c7c7c7c7", title: "How Acme uses GPT-6 Astra to cut costs" };
  eq(sel.screenDecision(story, { result: "UNCERTAIN", reason: "x" }, sel.metadataScore(story, { result: "UNCERTAIN" })).decision, "EXCLUDE");
});

// ---------- 6-5) Phase 7.1.3: AI 초안 · 초안 QA ----------
const FAKE_KEY = "sk-ant-test-FAKEKEY-not-real-0123456789";
const WIDGET_ID = col.items.find((i) => i.url.endsWith("/widget-2")).id;
// 근거(WIDGET_SENTENCES = E1~E7, 피드 설명 = E0)와 맞는 한국어 초안
const widgetDraft = () => ({
  title: "Widget 2 개발자 공개, 하루 1,000회 무료 요청",
  summary: "FX A가 2026년 10월 7일 Widget 2를 API로 전 세계 개발자에게 공개했습니다.",
  category: "PRODUCT_UPDATE",
  topics: ["ai-coding"],
  companies: ["FX A"],
  products: ["Widget 2"],
  facts: [
    { text: "무료 요금제는 계정마다 하루 1,000회 요청을 제공합니다.", evidence: ["E2"] },
    { text: "유료 요금제는 개발자 좌석당 월 $20부터입니다.", evidence: ["E5"] },
    { text: "FX A는 내부 벤치마크에서 Widget 1보다 응답이 3배 빠르다고 밝혔습니다.", evidence: ["E3"] },
  ],
  why: { text: "무료 구간이 생겨 개발자가 비용 부담 없이 먼저 확인해 볼 여지가 커졌습니다.", evidence: ["E2"] },
  change: { text: "기존 Widget 1 연동은 2027년 3월 31일까지 동작하므로 그 전에 전환 계획이 필요합니다.", evidence: ["E6"] },
  checks: [{ text: "무료 한도와 유료 요금이 내 사용량에 맞는지 확인하세요.", evidence: ["E2", "E5"] }, { text: "기업 고객은 계정 팀을 통해 더 높은 한도를 요청할 수 있습니다.", evidence: ["E7"] }],
  unknowns: ["국내 제공 조건과 한국어 지원 여부는 공식 발표에 나와 있지 않습니다."],
  editorialDepth: "SHORT",
  insufficient: false,
});
const W_LEDGER = { status: "OK", grade: "LIMITED", pageDate: null, ledger: [{ id: "E0", kind: "feed", text: LONG_DESC }, ...WIDGET_SENTENCES.map((t, i) => ({ id: `E${i + 1}`, kind: "body", text: t }))] };
const W_ITEM = { ...col.items.find((i) => i.url.endsWith("/widget-2")) };
const qa = (d, patch = {}) => dr.reviewDraft(d, { item: W_ITEM, evidence: W_LEDGER, existing: existing(), dup: { result: "NEW" }, suggestedDepth: "SHORT", ...patch });
const codes = (res) => res.issues.map((i) => `${i.severity}:${i.code}`);
const anthropicReply = (draft, usage = { input_tokens: 1200, output_tokens: 800 }, stop = "end_turn") => new Response(JSON.stringify({ content: [{ type: "text", text: JSON.stringify(draft) }], usage, stop_reason: stop }), { status: 200, headers: { "content-type": "application/json" } });
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));

await t("초안 QA: 근거와 맞는 한국어 초안은 PASS (6개 항목 모두 PASS)", async () => {
  const res = qa(widgetDraft());
  eq(res.verdict, "PASS", JSON.stringify(res.issues));
  eq(Object.values(res.checks).map((c) => c.result), ["PASS", "PASS", "PASS", "PASS", "PASS", "PASS"]);
});
await t("초안 QA FACT: 근거 없는 수치·가격 통화·날짜·지역·출시 단계·API → FAIL", async () => {
  const cases = [
    [(d) => (d.facts[0].text = "무료 요금제는 하루 5,000회 요청을 제공합니다."), "FAIL:unsupported_number"],
    [(d) => (d.facts[1].text = "유료 요금제는 월 20,000원부터입니다."), "FAIL:price_currency"],
    [(d) => (d.summary = "FX A가 2026년 10월 9일 Widget 2를 공개했습니다."), "FAIL:unsupported_date"],
    [(d) => (d.change.text = "한국에서도 바로 사용할 수 있습니다."), "FAIL:unsupported_region"],
    [(d) => (d.summary = "FX A가 Widget 2를 베타로 공개했습니다."), "FAIL:rollout_mismatch"],
    [(d) => (d.why.text = "Widget 2가 프로 요금제 사용자에게 먼저 제공됩니다."), null], // 근거 없는 요금제 이름은 한국어라 이름 검사 밖 → 사람이 확인 (아래 영문 이름은 잡음)
    [(d) => (d.why.text = "Pro 요금제 사용자에게 먼저 제공됩니다."), "REVIEW:unverified_term"],
  ];
  for (const [mut, code] of cases) {
    const d = widgetDraft();
    mut(d);
    const res = qa(d);
    if (code) ok(codes(res).includes(code), `${code} 기대 · ${JSON.stringify(codes(res))}`);
    if (code?.startsWith("FAIL")) eq(res.verdict, "FAIL", code);
  }
  // GA: 근거가 preview인데 정식 제공이라고 쓰면 FAIL
  const pv = { ...W_LEDGER, ledger: [{ id: "E1", kind: "body", text: "Widget 2 is available in limited preview for developers starting October 7, 2026." }, { id: "E2", kind: "body", text: "The preview includes 1,000 free requests per day." }] };
  const d = widgetDraft();
  d.facts = [{ text: "Widget 2가 정식 출시됐습니다.", evidence: ["E1"] }];
  ok(codes(dr.reviewDraft(d, { item: W_ITEM, evidence: pv, existing: existing(), dup: { result: "NEW" }, suggestedDepth: "SHORT" })).includes("FAIL:rollout_mismatch"), "GA vs preview");
  // API: 근거에 API 언급이 없으면 FAIL
  const noApi = { ...W_LEDGER, ledger: W_LEDGER.ledger.map((e) => ({ ...e, text: e.text.replace(/\bAPI\b/g, "console") })) };
  ok(codes(dr.reviewDraft(widgetDraft(), { item: { ...W_ITEM, title: "Introducing Widget 2" }, evidence: noApi, existing: existing(), dup: { result: "NEW" }, suggestedDepth: "SHORT" })).includes("FAIL:unsupported_api"), "API 제공");
  // '확인되지 않았다'는 주장 아님
  const neg = widgetDraft();
  neg.checks.push({ text: "한국 제공 여부는 확인되지 않았습니다.", evidence: ["E1"] });
  ok(!codes(qa(neg)).includes("FAIL:unsupported_region"), "부정문 오탐");
});
await t("초안 QA FACT: 모델명·버전 오류 검출 (GPT-6 ≠ GPT-6.1, Claude Sonnet 5 ≠ 5.5, 근거에 없는 이름)", async () => {
  const ev = { status: "OK", grade: "LIMITED", ledger: [{ id: "E1", kind: "body", text: "GPT-6.1 Sol is now available in the API at a lower price than GPT-6 Astra." }, { id: "E2", kind: "body", text: "Claude Sonnet 5.5 is available on Amazon Bedrock in 3 regions." }] };
  const item = { url: "https://x.test/a", publishedAt: "2026-10-07T00:00:00Z", title: "Introducing GPT-6.1 Sol", sourceName: "OpenAI" };
  const base = { title: "GPT-6.1 Sol 공개", summary: "OpenAI가 GPT-6.1 Sol을 API로 공개했습니다.", category: "PRODUCT_UPDATE", topics: [], facts: [{ text: "GPT-6.1 Sol은 API에서 쓸 수 있습니다.", evidence: ["E1"] }], why: { text: "x 설명 문장입니다 충분히.", evidence: ["E1"] }, change: { text: "y 설명 문장입니다 충분히.", evidence: ["E1"] }, checks: [{ text: "요금을 확인하세요.", evidence: ["E1"] }], unknowns: [], editorialDepth: "SHORT" };
  const run = (patch) => codes(dr.reviewDraft({ ...base, ...patch }, { item, evidence: ev, existing: existing(), dup: { result: "NEW" }, suggestedDepth: "SHORT" }));
  ok(!run({}).some((c) => c.startsWith("FAIL")), JSON.stringify(run({})));
  ok(run({ summary: "OpenAI가 GPT-6 Sol을 공개했습니다." }).includes("FAIL:model_version_mismatch"), "GPT-6 vs 6.1");
  ok(run({ facts: [{ text: "Claude Sonnet 5는 3개 지역에서 제공됩니다.", evidence: ["E2"] }] }).includes("FAIL:model_version_mismatch"), "Sonnet 5 vs 5.5");
  ok(run({ facts: [{ text: "Gemini 3.5와 비교됩니다.", evidence: ["E1"] }] }).includes("FAIL:unsupported_name"), "근거에 없는 모델");
  ok(run({ products: ["GPT-7"] }).includes("FAIL:unsupported_name"), "products 이름");
});
await t("초안 QA SAFETY·EDITORIAL: 허위 사용 경험 · 과장 제목 · 근거 없는 시장 전망 → FAIL, 회사 주장 무출처 · 상대 날짜 → REVIEW", async () => {
  for (const [mut, code] of [
    [(d) => (d.why.text = "AI마중이 직접 써 보니 응답이 빨랐습니다."), "FAIL:fake_experience"],
    [(d) => (d.change.text = "직접 재봄: 응답 시간이 절반으로 줄었습니다."), "FAIL:fake_experience"],
    [(d) => (d.handsOn = true), "FAIL:fake_experience"],
    [(d) => (d.title = "충격! Widget 2 무료 공개"), "FAIL:hype_title"],
    [(d) => (d.why.text = "이번 발표로 AI 시장 점유율 판도가 바뀔 것으로 보인다."), "FAIL:market_speculation"],
    [(d) => (d.why.text = "업계 최고 수준의 속도를 냅니다."), "REVIEW:company_claim_unattributed"],
    [(d) => (d.summary = "오늘 FX A가 Widget 2를 공개했습니다."), "REVIEW:relative_date"],
    [(d) => (d.facts[0].text = "무료 요청 1,000회는 개발자 확산에 기여할 것으로 보인다."), "REVIEW:interpretation_in_facts"],
  ]) {
    const d = widgetDraft();
    mut(d);
    ok(codes(qa(d)).includes(code), `${code} · ${JSON.stringify(codes(qa(d)))}`);
  }
});
await t("초안 QA STRUCTURE·DUPLICATE·EVIDENCE: 근거 id 누락·DEEP·근거보다 깊은 유형 → FAIL, 기존 기사와 같은 사안 → FAIL/REVIEW", async () => {
  const noId = widgetDraft();
  noId.facts[0].evidence = ["E99"];
  eq(qa(noId).verdict, "FAIL");
  const deep = widgetDraft();
  deep.editorialDepth = "DEEP";
  ok(codes(qa(deep)).includes("FAIL:deep_not_allowed"), "DEEP");
  const std = widgetDraft();
  std.editorialDepth = "STANDARD";
  ok(codes(qa(std)).includes("FAIL:depth_exceeds_evidence"), "SHORT 근거로 STANDARD");
  ok(!codes(qa(std, { suggestedDepth: "STANDARD" })).includes("FAIL:depth_exceeds_evidence"), "STANDARD 허용");
  const thin = { ...std, facts: [std.facts[0]], checks: [std.checks[0]], why: { text: "비용 부담이 줄었습니다.", evidence: ["E2"] } };
  const thinRes = qa(thin, { suggestedDepth: "STANDARD" });
  ok(codes(thinRes).includes("REVIEW:length_out_of_range") && thinRes.verdict === "REVIEW", `STANDARD 길이(약 400~800자)보다 짧음 → REVIEW (FAIL 아님) ${dr.bodyLength(thin)}자 ${JSON.stringify(codes(thinRes))}`);
  ok(codes(qa(widgetDraft(), { dup: { result: "DUPLICATE", reason: "같은 원문" } })).includes("FAIL:duplicate"), "중복");
  ok(codes(qa(widgetDraft(), { dup: { result: "UPDATE_EXISTING", matchSlug: "x" } })).includes("REVIEW:update_existing"), "후속");
  ok(codes(qa(widgetDraft(), { evidence: { ...W_LEDGER, status: "HTTP_403" } })).includes("FAIL:source_blocked"), "원문 미확인");
  eq(dr.LENGTH_RANGE, { SHORT: [150, 350], STANDARD: [400, 800] });
});
await t("초안 대상: PUBLISH·NEW/확인된 UPDATE·원문 OK·사실 2개+·주소·일자·공식만 — HOLD·EXCLUDE·UNCERTAIN·근거 부족·DEEP 차단", async () => {
  const good = { decision: "PUBLISH", dup: { result: "NEW" }, evidence: W_LEDGER, facts: 6, depth: "SHORT", item: W_ITEM };
  eq(dr.draftEligibility(good), { ok: true, reasons: [] });
  ok(dr.draftEligibility({ ...good, depth: "STANDARD" }).ok, "STANDARD");
  ok(dr.draftEligibility({ ...good, dup: { result: "UPDATE_EXISTING", matchSlug: "gizmo" } }).ok, "확인된 후속");
  for (const [patch, re] of [
    [{ decision: "HOLD" }, /PUBLISH만/],
    [{ decision: "EXCLUDE" }, /PUBLISH만/],
    [{ dup: { result: "UNCERTAIN" } }, /UNCERTAIN/],
    [{ dup: { result: "UPDATE_EXISTING" } }, /UPDATE_EXISTING/],
    [{ evidence: { ...W_LEDGER, status: "HTTP_403" } }, /원문 근거 HTTP_403/],
    [{ evidence: { status: "OK", ledger: [{ id: "E0", kind: "feed", text: "x" }] }, facts: 1 }, /핵심 사실 부족/],
    [{ depth: "DEEP" }, /DEEP/],
    [{ depth: null }, /유형 없음/],
    [{ item: { ...W_ITEM, datePrecision: "month" } }, /발표일/],
    [{ item: { ...W_ITEM, url: "http://insecure.test/x" } }, /주소/],
    [{ item: { ...W_ITEM, sourceType: "press" } }, /공식/],
  ]) {
    const g = dr.draftEligibility({ ...good, ...patch });
    ok(!g.ok && g.reasons.some((x) => re.test(x)), `${JSON.stringify(patch).slice(0, 50)} → ${JSON.stringify(g)}`);
  }
});
await t("모드: 값 없음·모르는 값 → shadow, draft는 명시할 때만, 예약 실행·다른 이벤트의 draft → shadow, publish → 거부", async () => {
  eq(lib.resolveMode({}).mode, "shadow");
  eq(lib.resolveMode({ DAILY_MODE: "" }).mode, "shadow");
  eq(lib.resolveMode({ DAILY_MODE: "normal" }).mode, "shadow");
  eq(lib.resolveMode({ DAILY_MODE: "draft" }).mode, "draft");
  eq(lib.resolveMode({ DAILY_MODE: "draft", GITHUB_ACTIONS: "true", GITHUB_EVENT_NAME: "workflow_dispatch" }).mode, "draft");
  eq(lib.resolveMode({ DAILY_MODE: "draft", GITHUB_ACTIONS: "true", GITHUB_EVENT_NAME: "schedule" }).mode, "shadow");
  eq(lib.resolveMode({ DAILY_MODE: "draft", GITHUB_ACTIONS: "true", GITHUB_EVENT_NAME: "push" }).mode, "shadow");
  ok(lib.resolveMode({ DAILY_MODE: "publish" }).error, "publish 거부");
  resetWeb();
  calls.length = 0;
  const opt = baseRun({ env: ENV({ DAILY_MODE: "publish" }) });
  const r = await runDaily(opt);
  eq([r.status, calls.length, fs.existsSync(opt.out)], ["REFUSED", 0, false]);
});
await t("shadow(기본): DAILY_MODE가 없으면 mock·키가 있어도 LLM 호출 0, 예약 실행에서 draft를 요청해도 0", async () => {
  for (const extra of [{ DAILY_MODE: undefined }, { DAILY_MODE: "draft", GITHUB_ACTIONS: "true", GITHUB_EVENT_NAME: "schedule" }]) {
    resetWeb();
    let llm = 0;
    const env = ENV({ DAILY_LLM_PROVIDER: "anthropic", ANTHROPIC_API_KEY: FAKE_KEY, ...extra });
    if (extra.DAILY_MODE === undefined) delete env.DAILY_MODE;
    const r = await runDaily(baseRun({ env, registry: { sources: [REGISTRY.sources[0]] }, fetch: async () => (llm++, anthropicReply(widgetDraft())) }));
    eq([llm, r.run.llm.calls, r.run.mode, r.run.counts.drafts], [0, 0, "shadow", 0], JSON.stringify(extra));
    ok(r.run.counts.PUBLISH >= 1, "선정은 그대로");
  }
});
await t("PUBLISH 0건이면 draft 모드에서도 LLM 호출 0 (뉴스 없는 날 · 후보가 모두 보류·제외인 날)", async () => {
  let llm = 0;
  const f = async () => (llm++, anthropicReply(widgetDraft()));
  WEB.clear();
  WEB.set("https://fx-a.test/feed.xml", { body: rss([]) });
  const a = await runDaily(baseRun({ env: ENV({ DAILY_LLM_PROVIDER: "anthropic", ANTHROPIC_API_KEY: FAKE_KEY }), registry: { sources: [REGISTRY.sources[0]] }, fetch: f }));
  WEB.clear();
  WEB.set("https://fx-a.test/feed.xml", { body: rss(ITEMS_A.filter((i) => /old|acme|sprocket/.test(i.link))) });
  const b = await runDaily(baseRun({ env: ENV({ DAILY_LLM_PROVIDER: "anthropic", ANTHROPIC_API_KEY: FAKE_KEY }), registry: { sources: [REGISTRY.sources[0]] }, fetch: f }));
  eq([a.run.counts.PUBLISH, b.run.counts.PUBLISH, llm, a.run.llm.calls + b.run.llm.calls], [0, 0, 0, 0]);
  eq(b.status, "SUCCESS");
});
await t("draft(anthropic, 가짜 응답): PUBLISH 후보에만 호출 · 요청 형식(모델·effort·thinking·버전) · 토큰·비용 기록 · drafts/ JSON·MD · QA PASS도 승인 대기", async () => {
  resetWeb();
  const seen = [];
  const f = async (url, init) => {
    const body = JSON.parse(init.body);
    seen.push({ url, body, headers: init.headers });
    return body.messages[0].content.includes("widget-2") ? anthropicReply(widgetDraft()) : anthropicReply({ ...widgetDraft(), title: "Gizmo Pro 3 확대 제공" });
  };
  const opt = baseRun({ env: ENV({ DAILY_LLM_PROVIDER: "anthropic", ANTHROPIC_API_KEY: FAKE_KEY }), fetch: f });
  const r = await runDaily(opt);
  const pubIds = r.run.items.filter((i) => i.decision === "PUBLISH" || /초안 QA FAIL/.test(i.reasons.join())).map((i) => i.id);
  eq(seen.length, r.run.llm.calls);
  ok(seen.length >= 1 && seen.length === pubIds.length, `호출 ${seen.length} · 대상 ${pubIds.length}`);
  const b = seen[0].body;
  eq([seen[0].url, b.model, b.output_config, b.thinking, seen[0].headers["anthropic-version"]], ["https://api.anthropic.com/v1/messages", "claude-sonnet-5-5", { effort: "medium" }, { type: "between_tools" }, "2023-06-01"]);
  ok(b.max_tokens === 3000 && !JSON.stringify(b).includes(FAKE_KEY), "본문에 키");
  eq([r.run.llm.inputTokens, r.run.llm.outputTokens], [1200 * seen.length, 800 * seen.length]);
  eq(r.run.llm.estimatedCostUsd, Number(((1200 * 2 + 800 * 10) / 1e6 * seen.length).toFixed(6)), "비용 = 입력 $2 + 출력 $10 / 100만 토큰");
  const rec = JSON.parse(fs.readFileSync(path.join(r.outDir, "drafts", `${WIDGET_ID}.json`), "utf8"));
  for (const k of ["candidateId", "title", "source", "evidenceSummary", "articleType", "draft", "qa", "fixes", "generation"]) ok(k in rec, `초안 기록 ${k}`);
  eq([rec.qa.verdict, rec.articleType, rec.generation.model, rec.generation.usage.inputTokens, rec.handsOn, rec.status], ["PASS", "SHORT", "claude-sonnet-5-5", 1200, false, "draft_for_editor_review"]);
  ok(rec.generation.generatedAt && rec.source.url.endsWith("/widget-2") && rec.evidenceSummary.ledger.length === 8, "출처·근거 요약");
  const md = fs.readFileSync(path.join(r.outDir, "drafts", `${WIDGET_ID}.md`), "utf8");
  for (const sec of ["핵심 요약", "무엇이 달라졌나", "왜 중요한가", "독자가 확인할 사항", "아직 확인되지 않은 부분", "출처 및 확인 범위", "발행 승인 아님", "직접 써 보지 않았습니다", "자동 QA", "수정 필요 사항"]) ok(md.includes(sec), `초안 MD에 '${sec}'`);
  const q = JSON.parse(fs.readFileSync(path.join(r.outDir, "candidates", `${WIDGET_ID}.json`), "utf8"));
  eq([q.decision, q.approval.status, q.draftQa.verdict, q.draftFile], ["PUBLISH", "pending", "PASS", `drafts/${WIDGET_ID}.md`]);
  const report = fs.readFileSync(path.join(r.outDir, "report.md"), "utf8");
  ok(report.includes("Draft Mode") && report.includes("## AI 초안") && report.includes("발행 승인 아님") && report.includes("예상 비용 $"), "보고서");
  ok(!walk(r.outDir).some((f) => fs.readFileSync(f, "utf8").includes(FAKE_KEY)), "결과 파일에 키");
});
await t("중복 생성 방지: 같은 날짜 재실행·대기열이 지워져도 같은 근거·프롬프트·모델이면 다시 부르지 않음, shadow 재실행은 초안을 지우지 않음", async () => {
  resetWeb();
  let n = 0;
  const f = async () => (n++, anthropicReply(widgetDraft()));
  const opt = baseRun({ env: ENV({ DAILY_LLM_PROVIDER: "anthropic", ANTHROPIC_API_KEY: FAKE_KEY }), registry: { sources: [REGISTRY.sources[0]] }, fetch: f });
  const first = await runDaily(opt);
  const made = n;
  ok(made >= 1, "첫 실행 생성");
  resetWeb();
  const again = await runDaily({ ...opt, processedFile: path.join(tmp, `p-${Math.random().toString(36).slice(2)}.json`) });
  eq([n, again.run.llm.calls, again.run.counts.drafts], [made, 0, first.run.counts.drafts], "재실행");
  fs.rmSync(path.join(first.outDir, "candidates"), { recursive: true });
  resetWeb();
  const third = await runDaily({ ...opt, processedFile: path.join(tmp, `p-${Math.random().toString(36).slice(2)}.json`) });
  eq([n, third.run.llm.calls], [made, 0], "drafts/ 기록으로 재사용");
  resetWeb();
  const shadow = await runDaily({ ...opt, env: ENV({ DAILY_MODE: "shadow" }), processedFile: path.join(tmp, `p-${Math.random().toString(36).slice(2)}.json`) });
  eq([n, shadow.run.counts.drafts], [made, first.run.counts.drafts], "shadow가 초안을 보존");
  ok(JSON.parse(fs.readFileSync(path.join(first.outDir, "drafts", `${WIDGET_ID}.json`), "utf8")).generation.reused, "재사용 표시");
});
await t("API 오류 처리: timeout·429·529는 retries번까지, 400·max_tokens 잘림은 재시도 없음, 비용 상한·미확인 모델·키 없음은 호출 0", async () => {
  const cand = { title: "t", sourceName: "s", url: "https://x.test", publishedAt: "2026-10-07T00:00:00Z" };
  const lim = { ...lib.DEFAULTS, llmRetries: 1 };
  const mk = (fetchFn, env = {}, limits = lim) => ({ provider: "anthropic", env: { ANTHROPIC_API_KEY: FAKE_KEY, ...env }, limits, budget: { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 }, categories: [], topics: [], suggestedDepth: "SHORT", retryDelayMs: 1, fetch: fetchFn });
  let n = 0;
  const timeout = async () => {
    n++;
    throw Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
  };
  n = 0;
  const t1 = await providers.generateArticle(cand, { ledger: [] }, mk(timeout));
  eq([t1.status, t1.error, n], ["failed", "timeout", 2]);
  for (const st of [429, 529]) {
    n = 0;
    const x = await providers.generateArticle(cand, { ledger: [] }, mk(async () => (n++, new Response("{}", { status: st }))));
    eq([x.status, n], ["failed", 2], `HTTP ${st}`);
  }
  n = 0;
  const bad = await providers.generateArticle(cand, { ledger: [] }, mk(async () => (n++, new Response("{}", { status: 400 }))));
  eq([bad.status, n], ["failed", 1], "400");
  n = 0;
  const cut = await providers.generateArticle(cand, { ledger: [] }, mk(async () => (n++, anthropicReply(widgetDraft(), { input_tokens: 10, output_tokens: 3000 }, "max_tokens"))));
  eq([cut.status, n, cut.usage.outputTokens], ["failed", 1, 3000], "max_tokens 잘림");
  n = 0;
  const flaky = await providers.generateArticle(cand, { ledger: [] }, mk(async () => (++n === 1 ? new Response("{}", { status: 503 }) : anthropicReply(widgetDraft()))));
  eq([flaky.status, n], ["ok", 2], "한 번 실패 후 성공");
  n = 0;
  const broke = await providers.generateArticle(cand, { ledger: [] }, mk(async () => (n++, new Response(JSON.stringify({ content: [{ type: "text", text: "not json" }], usage: {} }), { status: 200 }))));
  eq([broke.status, broke.error, n], ["failed", "JSON 형식 오류", 1]);
  // 비용 상한: 호출 전 최악 비용으로 막음
  n = 0;
  const capped = await providers.generateArticle(cand, { ledger: [] }, mk(async () => (n++, anthropicReply(widgetDraft())), {}, { ...lim, maxCostUsd: 0.001 }));
  eq([capped.status, n], ["skipped", 0], "비용 상한");
  ok(/비용 상한/.test(capped.error), capped.error);
  n = 0;
  const unknown = await providers.generateArticle(cand, { ledger: [] }, mk(async () => (n++, anthropicReply(widgetDraft())), { DAILY_LLM_MODEL: "claude-made-up-9" }));
  eq([unknown.status, n], ["skipped", 0], "확인되지 않은 모델");
  n = 0;
  const haiku = await providers.generateArticle(cand, { ledger: [] }, mk(async () => (n++, anthropicReply(widgetDraft())), { DAILY_LLM_MODEL: "claude-haiku-5-5" }));
  eq([haiku.status, n], ["skipped", 0], "요금 미정 모델은 요금 설정 없이는 호출 안 함");
  eq(providers.resolveModelConfig({ DAILY_LLM_MODEL: "claude-haiku-5-5", DAILY_LLM_PRICE_INPUT: "0.1", DAILY_LLM_PRICE_OUTPUT: "0.5" }).inputPerMTok, 0.1);
  eq([lib.loadLimits({ DAILY_MAX_COST_USD: "" }).maxCostUsd, lib.loadLimits({ DAILY_MAX_COST_USD: "0.2" }).maxCostUsd, lib.loadLimits({ DAILY_MAX_COST_USD: "99" }).maxCostUsd], [0.5, 0.2, 3]);
});
await t("한 후보의 생성 실패가 다른 후보를 막지 않음 (실패 후보는 원고 없음 · 나머지는 초안 · PARTIAL)", async () => {
  resetWeb();
  const r = await runDaily(baseRun({ env: ENV(), mockReply: (c) => (c.url.endsWith("/widget-2") ? new Error("upstream exploded") : { ...widgetDraft(), title: "Gizmo Pro 3 확대", products: [] }) }));
  const w = JSON.parse(fs.readFileSync(path.join(r.outDir, "candidates", `${WIDGET_ID}.json`), "utf8"));
  eq([w.generation.status, w.draft], ["failed", null]);
  ok(r.run.counts.drafts >= 1, "다른 후보 초안");
  eq(r.status, "PARTIAL");
});
await t("draft인데 ANTHROPIC_API_KEY가 없으면: 안내 후 LLM 호출 0, 수집·선정·보고서는 그대로 (PARTIAL)", async () => {
  resetWeb();
  let n = 0;
  const logs = [];
  const r = await runDaily(baseRun({ env: ENV({ DAILY_LLM_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "" }), registry: { sources: [REGISTRY.sources[0]] }, fetch: async () => (n++, anthropicReply(widgetDraft())), log: (m) => logs.push(m) }));
  eq([n, r.run.llm.calls, r.run.counts.drafts, r.status], [0, 0, 0, "PARTIAL"]);
  ok(/ANTHROPIC_API_KEY가 설정되지 않음/.test(r.run.draftBlocked) && logs.some((l) => l.includes("초안 생성 안 함")), "안내");
  ok(r.run.counts.PUBLISH >= 1 && fs.readFileSync(path.join(r.outDir, "report.md"), "utf8").includes("초안을 만들지 않았습니다"), "보고서 안내");
});
await t("API 키 유출 방지: 오류 문장에 키가 섞여도 결과·보고서·로그·run.json에 남지 않음", async () => {
  resetWeb();
  const logs = [];
  const r = await runDaily(baseRun({
    env: ENV({ DAILY_LLM_PROVIDER: "anthropic", ANTHROPIC_API_KEY: FAKE_KEY }),
    registry: { sources: [REGISTRY.sources[0]] },
    fetch: async () => {
      throw new Error(`connect failed for key=${FAKE_KEY} and sk-ant-other-secret-abcdef`);
    },
    log: (m) => logs.push(m),
  }));
  const all = walk(r.outDir).map((f) => fs.readFileSync(f, "utf8")).join("\n") + logs.join("\n");
  ok(!all.includes(FAKE_KEY) && !all.includes("sk-ant-other"), "키 노출");
  ok(all.includes("[REDACTED]"), "가림 표시");
  eq(providers.redact(`x ${FAKE_KEY} y`, { ANTHROPIC_API_KEY: FAKE_KEY }), "x [REDACTED] y");
});
await t("초안 QA FAIL → 승인 대기에서 제외 (HOLD · approvable false · daily:approve 거부)", async () => {
  resetWeb();
  const r = await runDaily(baseRun({ env: ENV({ DAILY_LLM_PROVIDER: "anthropic", ANTHROPIC_API_KEY: FAKE_KEY }), registry: { sources: [REGISTRY.sources[0]] }, fetch: async () => anthropicReply({ ...widgetDraft(), why: { text: "AI마중이 직접 써 보니 응답이 확실히 빨랐습니다.", evidence: ["E3"] } }) }));
  const q = JSON.parse(fs.readFileSync(path.join(r.outDir, "candidates", `${WIDGET_ID}.json`), "utf8"));
  eq([q.decision, q.draftQa.verdict], ["HOLD", "FAIL"]);
  ok(q.reasons.some((x) => x.includes("초안 QA FAIL")), JSON.stringify(q.reasons));
  const rec = JSON.parse(fs.readFileSync(path.join(r.outDir, "drafts", `${WIDGET_ID}.json`), "utf8"));
  eq([rec.approvable, rec.qa.checks.SAFETY.result], [false, "FAIL"]);
  const qd = path.join(tmp, "qafail");
  fs.mkdirSync(path.join(qd, DATE, "candidates"), { recursive: true });
  fs.writeFileSync(path.join(qd, DATE, "candidates", `${WIDGET_ID}.json`), JSON.stringify({ ...q, decision: "PUBLISH", generation: { ...q.generation, provider: "anthropic" }, needsReview: [] }));
  const a = await approve({ date: DATE, id: WIDGET_ID, queueDir: qd, publish: false, recheckSource: false, dryRun: true, log: quiet });
  ok(!a.ok && a.problems.some((p) => /초안 QA FAIL/.test(p)), JSON.stringify(a.problems));
});
await t("Production 파일 보호: draft 실행은 out 폴더(candidates·drafts·run.json·report.md)에만 쓰고 content/·ingest/ 추적 파일은 그대로", async () => {
  resetWeb();
  const before = spawnSync("git", ["status", "--porcelain", "--", "content", "ingest", "newsletter"], { cwd: SITE, encoding: "utf8" }).stdout;
  const r = await runDaily(baseRun({ env: ENV({ DAILY_LLM_PROVIDER: "anthropic", ANTHROPIC_API_KEY: FAKE_KEY }), fetch: async () => anthropicReply(widgetDraft()) }));
  const rel = walk(r.outDir).map((f) => path.relative(r.outDir, f).replace(/\\/g, "/").split("/")[0]);
  ok(rel.every((x) => ["candidates", "drafts", "run.json", "report.md"].includes(x)), JSON.stringify([...new Set(rel)]));
  eq(spawnSync("git", ["status", "--porcelain", "--", "content", "ingest", "newsletter"], { cwd: SITE, encoding: "utf8" }).stdout, before);
});

// ---------- 7) 승인 ----------
const Q = path.join(tmp, "queue");
const wItem = col.items.find((i) => i.url.endsWith("/widget-2"));
const QID = wItem.id;
const writeQ = (patch = {}) => {
  const base = JSON.parse(fs.readFileSync(path.join(fullOpt.out, DATE, "candidates", `${QID}.json`), "utf8"));
  const e = { ...base, decision: "PUBLISH", needsReview: [], validation: { errors: [], needsReview: [] }, generation: { ...base.generation, provider: "anthropic", status: "ok", model: "test" }, draft: goodDraft(), proposedSlug: "fx-widget-2-launch", evidence: { ...EVID, ledger: EVID.ledger.map((x) => ({ ...x, sourceUrl: wItem.url, source: "FX A", publishedAt: wItem.publishedAt, checkedAt: "2026-10-07T00:00:00Z" })) }, ...patch };
  fs.mkdirSync(path.join(Q, DATE, "candidates"), { recursive: true });
  fs.writeFileSync(path.join(Q, DATE, "candidates", `${QID}.json`), JSON.stringify(e));
  return e;
};
await t("승인 거부: mock 원고·HOLD·DEEP·검증 오류·미확인 항목·이미 승인·잘못된 slug·형식 오류", async () => {
  const cases = [
    [{ generation: { provider: "mock", status: "ok" } }, /mock/],
    [{ decision: "HOLD" }, /PUBLISH만/],
    [{ draft: { ...goodDraft(), editorialDepth: "DEEP" } }, /DEEP/],
    [{ validation: { errors: ["facts[0] 근거 없음"], needsReview: [] } }, /검증 오류/],
    [{ needsReview: ["numeric_claim"] }, /--ack numeric_claim/],
    [{ approval: { status: "approved" } }, /이미 처리됨/],
    [{ proposedSlug: "Bad Slug!" }, /slug 형식/],
    [{ draft: null, generation: { provider: "none", status: "skipped" } }, /원고 없음/],
  ];
  for (const [patch, re] of cases) {
    writeQ(patch);
    const r = await approve({ date: DATE, id: QID, queueDir: Q, publish: false, recheckSource: false, dryRun: true, log: quiet });
    ok(!r.ok && r.problems.some((p) => re.test(p)), `${JSON.stringify(patch).slice(0, 60)} → ${JSON.stringify(r.problems)}`);
  }
  const bad = await approve({ date: "2026/10/07", id: "zz", queueDir: Q, publish: false, recheckSource: false, log: quiet });
  ok(!bad.ok, "형식");
});
await t("승인: 확인 항목을 --ack로 표시하면 통과 (dry-run은 아무것도 쓰지 않음)", async () => {
  writeQ({ needsReview: ["numeric_claim"] });
  const before = fs.readFileSync(path.join(SITE, "ingest/editorial/2026-10.json"), "utf8");
  const r = await approve({ date: DATE, id: QID, queueDir: Q, ack: ["numeric_claim"], publish: false, recheckSource: false, dryRun: true, log: quiet });
  ok(r.ok && r.dryRun, JSON.stringify(r));
  eq(fs.readFileSync(path.join(SITE, "ingest/editorial/2026-10.json"), "utf8"), before, "실제 파일 변경");
});
await t("승인(전체): 임시 복사본에서 후보·편집 원고 추가 → publish.mjs 성공 → 기사 생성, 원문 재확인 포함", async () => {
  const root = path.join(tmp, "root");
  for (const d of ["content/stories", "ingest/candidates", "ingest/editorial"]) fs.cpSync(path.join(SITE, d), path.join(root, d), { recursive: true });
  fs.copyFileSync(path.join(SITE, "content/topics.json"), path.join(root, "content/topics.json"));
  writeQ();
  const fx = path.join(tmp, "fixtures.json");
  fs.writeFileSync(fx, JSON.stringify({ [wItem.url]: { status: 200, body: bodyPage(WIDGET_SENTENCES) } }));
  const r = spawnSync(process.execPath, ["--import", "file:///" + path.join(HERE, "fixtures/fetch-stub.mjs").replace(/\\/g, "/"), path.join(HERE, "approve.mjs"), DATE, QID, "--queue", Q], {
    encoding: "utf8",
    env: { ...process.env, AIMAJUNG_ROOT: root, DAILY_FETCH_FIXTURES: fx },
  });
  ok(r.status === 0, `승인 실패: ${(r.stdout + r.stderr).slice(-600)}`);
  const stories = JSON.parse(fs.readFileSync(path.join(root, "content/stories/2026-10.json"), "utf8"));
  const s = stories.find((x) => x.slug === "fx-widget-2-launch");
  ok(s, "기사 없음");
  eq([s.editorialDepth, s.sourceUrl, s.candidateId, s.facts.length], ["short", wItem.url, QID, 2]);
  const q = JSON.parse(fs.readFileSync(path.join(Q, DATE, "candidates", `${QID}.json`), "utf8"));
  eq(q.approval.status, "approved");
  // 같은 후보 다시 승인 → 거부
  const again = spawnSync(process.execPath, ["--import", "file:///" + path.join(HERE, "fixtures/fetch-stub.mjs").replace(/\\/g, "/"), path.join(HERE, "approve.mjs"), DATE, QID, "--queue", Q], { encoding: "utf8", env: { ...process.env, AIMAJUNG_ROOT: root, DAILY_FETCH_FIXTURES: fx } });
  ok(again.status !== 0, "재승인 통과됨");
});
await t("승인: 원문이 사라졌거나 막히면 --ack source_blocked 없이 거부", async () => {
  const root = path.join(tmp, "root2");
  for (const d of ["content/stories", "ingest/candidates", "ingest/editorial"]) fs.cpSync(path.join(SITE, d), path.join(root, d), { recursive: true });
  fs.copyFileSync(path.join(SITE, "content/topics.json"), path.join(root, "content/topics.json"));
  writeQ({ proposedSlug: "fx-widget-2-gone" });
  const fx = path.join(tmp, "fixtures2.json");
  fs.writeFileSync(fx, JSON.stringify({ [wItem.url]: { status: 404, body: "gone" } }));
  const r = spawnSync(process.execPath, ["--import", "file:///" + path.join(HERE, "fixtures/fetch-stub.mjs").replace(/\\/g, "/"), path.join(HERE, "approve.mjs"), DATE, QID, "--queue", Q], { encoding: "utf8", env: { ...process.env, AIMAJUNG_ROOT: root, DAILY_FETCH_FIXTURES: fx } });
  ok(r.status !== 0 && /HTTP 404/.test(r.stderr), r.stderr.slice(-300));
  ok(!fs.readFileSync(path.join(root, "ingest/editorial/2026-10.json"), "utf8").includes("fx-widget-2-gone"), "거부했는데 썼음");
});

// ---------- 8) 안전 경계 (정적 검사) ----------
await t("워크플로: master 직접 push 없음, automation/daily-* 브랜치·PR만, 킬 스위치 변수, 배포·뉴스레터 없음", async () => {
  const wf = fs.readFileSync(path.join(REPO, ".github/workflows/daily-editorial.yml"), "utf8");
  ok(/if: \$\{\{ vars\.DAILY_AUTOMATION_ENABLED == 'true' \}\}/.test(wf), "킬 스위치 조건");
  // 정각을 피한 예약 (21:17 UTC = 06:17 KST). 정확한 시각을 보장한다고 주장하지 않음 — 따라잡기로 누락을 막는다
  // Phase 7.2: 07:07 KST 정기 + 19:07 KST 추가 실행 (정각 회피). 정확한 시각은 보장하지 않는다 — 따라잡기·대기열로 누락을 막는다
  ok(/cron: "7 22 \* \* \*"/.test(wf) && /cron: "7 10 \* \* \*"/.test(wf), "22:07 UTC = 07:07 KST · 10:07 UTC = 19:07 KST");
  ok(/정확한 실행 시각은 보장되지 않는다/.test(wf), "시각 보장 주장 없음");
  const pushes = wf.split("\n").filter((l) => /git (-C "\$W" )?push/.test(l));
  // automation/daily-* PR 브랜치 + automation/pipeline-state(대기열·처리 기록) 두 곳만. master로는 push하지 않는다
  eq(pushes.length, 2, "push 위치");
  ok(pushes[0].includes('git -C "$W" push origin HEAD:refs/heads/automation/pipeline-state'), pushes[0]);
  ok(pushes[1].trim() === 'git push origin "HEAD:refs/heads/$B"', pushes[1]);
  ok(/B="automation\/daily-\$D"/.test(wf) && /case "\$B" in automation\/daily-\*\)/.test(wf), "브랜치 이름 고정");
  ok(!/push.*(master|main)\b|--force|-f\b/.test(pushes.join("\n")), "master·force push");
  // DAILY는 배포·뉴스레터·승인·기사 반영을 직접 하지 않는다 (자동 발행은 별도 보호된 publish.yml을 부를 뿐)
  ok(!/vercel|newsletter|daily:approve|publish:daily|pipeline:publish|publish\.mjs/.test(wf), "배포·뉴스레터·승인·발행이 워크플로에 있음");
  ok(/gh pr list --head "\$B" --state open/.test(wf), "같은 날짜 PR 재사용");
  ok(!/ANTHROPIC_API_KEY[^:]*\becho|echo .*ANTHROPIC/.test(wf), "키 출력");
  // 예약 실행은 언제나 shadow. draft는 수동 실행에서 고른 경우에만, LLM 키도 그때만
  ok(/M=shadow\n\s+P=none\n\s+if \[ "\$EVENT" = "workflow_dispatch" \] && \[ "\$INPUT_MODE" = "draft" \] && \[ "\$BACKFILL" != "true" \]; then M=draft; P=anthropic; fi/.test(wf), "모드 결정 (유료는 수동 draft만, 백필은 언제나 shadow)");
  ok(/if \[ "\$P" = "none" \] && \[ "\$FREE_DRAFT" = "true" \] && \[ "\$BACKFILL" != "true" \]; then M=draft; P=gemini; fi/.test(wf), "무료 생성은 운영자가 켠 경우만");
  ok(/GEMINI_API_KEY: \$\{\{ steps\.m\.outputs\.provider == 'gemini' && steps\.ps\.outputs\.queue == 'true' && secrets\.GEMINI_API_KEY \|\| '' \}\}/.test(wf), "Gemini 키는 gemini이고 사용 기록을 되살렸을 때만");
  ok(/AUTO_PUBLISH_ENABLED == 'true' && steps\.m\.outputs\.provider != 'gemini'/.test(wf), "Gemini 실행은 자동 발행하지 않음");
  ok(/DAILY_GEMINI_BILLING_TIER: \$\{\{ vars\.DAILY_GEMINI_BILLING_TIER \}\}/.test(wf), "결제 등급 확인 값 전달");
  ok(/name: Restore processed index\s+if: steps\.ps\.outputs\.queue != 'true'/.test(wf), "브랜치 기록을 캐시로 덮어쓰지 않음");
  ok((wf.match(/secrets\.GEMINI_API_KEY/g) ?? []).length === 1, "Gemini 키는 한 단계에만");
  ok(/^concurrency:\s+group: aimajung-daily\s+cancel-in-progress: false/m.test(wf), "예약·수동 실행 모두 한 번에 하나");
  ok(/site\/ingest\/log\/pipeline-queue\.json/.test(wf), "대기열을 이어 씀");
  ok(/if: always\(\) && vars\.AUTO_PUBLISH_ENABLED == 'true'/.test(wf), "자동 발행은 운영자가 켰을 때만");
  ok(/DAILY_LAST_RUN_DATE: \$\{\{ steps\.last\.outputs\.date \}\}/.test(wf) && /automation\/daily-20\*/.test(wf), "따라잡기: 마지막 실행 브랜치");
  ok(/npm run daily:backfill -- --from "\$INPUT_FROM" --to "\$INPUT_TO"/.test(wf), "백필 실행");
  ok(/site\/ingest\/log\/daily-sources\.json/.test(wf), "소스 상태 기록을 캐시로 이어 씀");
  ok(/DAILY_MODE: \$\{\{ steps\.m\.outputs\.mode \}\}/.test(wf), "모드 전달");
  ok(/DAILY_LLM_PROVIDER: \$\{\{ steps\.m\.outputs\.provider \}\}/.test(wf), "공급자는 Mode 단계에서 (기본 none)");
  eq(wf.match(/secrets\.ANTHROPIC_API_KEY/g)?.length, 1, "키 사용 위치");
  ok(/ANTHROPIC_API_KEY: \$\{\{ steps\.m\.outputs\.provider == 'anthropic' && github\.event_name == 'workflow_dispatch' && secrets\.ANTHROPIC_API_KEY \|\| '' \}\}/.test(wf), "유료 키는 수동 draft에서만");
  ok(/default: shadow/.test(wf), "수동 실행 기본값 shadow");
  ok(!/gh pr merge|--auto|auto-merge/.test(wf), "자동 merge");
  // 보고서 fallback: Summary + artifact는 항상, PR은 실패해도 계속
  ok(/actions\/upload-artifact@v4/.test(wf) && /name: daily-report-\$\{\{ steps\.d\.outputs\.rid \}\}/.test(wf) && /overwrite: true/.test(wf), "artifact 업로드");
  const step = (name) => wf.split(/\n      - name: /).find((x) => x.startsWith(name)) ?? "";
  ok(/if: always\(\)/.test(step("Upload report artifact")), "artifact는 항상");
  ok(/continue-on-error: true/.test(step("Branch + PR")), "PR 실패가 artifact를 막지 않음");
  ok(/GITHUB_STEP_SUMMARY/.test(step("Job summary")), "Summary");
  ok(wf.indexOf("Upload report artifact") < wf.indexOf("Branch + PR"), "artifact가 PR보다 먼저");
});
await t("자동화 코드: 뉴스레터 발송·Resend·content 직접 쓰기·git push 없음", async () => {
  for (const f of ["lib.mjs", "run.mjs", "providers.mjs", "report.mjs", "draft.mjs", "health.mjs", "diagnose.mjs"]) {
    const s = fs.readFileSync(path.join(HERE, f), "utf8");
    ok(!/resend|broadcast|newsletter\/send|emails\.send|git push|child_process/i.test(s.replace(/뉴스레터는 만들거나 보내지 않는다|뉴스레터 후보|뉴스레터도 만들거나 보내지 않습니다/g, "")), `${f}에 발송·push 코드`);
    ok(!/content[\\/"']+stories[^\n]*writeFileSync|writeFileSync[^\n]*content[\\/]stories/.test(s), `${f}가 content/stories에 씀`);
  }
});
// ---------- 9) 수집 안정화 · 백필 (Phase 7.1.5) ----------
const health = await import("./health.mjs");
const diag = await import("./diagnose.mjs");
const coll = await import("../ingest/collectors.mjs");
const { canonicalUrl: canonical } = await import("../ingest/lib.mjs");
const metaPage = (title, published, extra = "") =>
  `<html><head><meta property="og:title" content="${title}">${published ? `<meta property="article:published_time" content="${published}">` : ""}<meta property="og:description" content="${title} is now available for developers in the API."></head><body>${extra}<p>${title} is now available for developers in the API with new features.</p></body></html>`;
const redirectedResponse = (body, finalUrl, type = "text/html") => () => {
  const res = new Response(body, { status: 200, headers: { "content-type": type } });
  Object.defineProperty(res, "redirected", { value: true });
  Object.defineProperty(res, "url", { value: finalUrl });
  return res;
};
// 기간 안·밖 항목이 섞인 피드 (발표일 기준 필터 확인용)
const BF_ITEMS = [
  { title: "Introducing Gadget 7 for teams", link: "https://fx-bf.test/news/gadget-7", date: "Tue, 06 Oct 2026 09:00:00 GMT", desc: "Gadget 7 is now available to all teams worldwide in the API with a free tier." },
  { title: "Gadget pricing update for enterprises", link: "https://fx-bf.test/news/gadget-pricing", date: "Thu, 08 Oct 2026 09:00:00 GMT", desc: "New pricing for Gadget starts at $10 per month per seat for enterprise customers." },
  { title: "Before the gap", link: "https://fx-bf.test/news/before", date: "Sun, 04 Oct 2026 09:00:00 GMT", desc: "Out of range (before)." },
  { title: "After the gap", link: "https://fx-bf.test/news/after", date: "Sun, 11 Oct 2026 09:00:00 GMT", desc: "Out of range (after)." },
];
const BF_REG = { sources: [{ id: "fx-bf", name: "FX BF", feedUrl: "https://fx-bf.test/feed.xml", sourceType: "official", tier: 1, fetchMode: "rss", enabled: true }] };
const bfWeb = () => {
  WEB.set("https://fx-bf.test/feed.xml", { body: rss(BF_ITEMS), type: "application/rss+xml" });
  WEB.set("https://fx-bf.test/news/gadget-7", { body: bodyPage(["Gadget 7 is now available to all teams worldwide in the API starting October 6, 2026.", "The free tier includes 500 requests per day for every account.", "Gadget 7 is 2x faster than Gadget 6 in internal tests.", "It supports 30 languages."]) });
  WEB.set("https://fx-bf.test/news/gadget-pricing", { body: bodyPage(["New pricing for Gadget starts at $10 per month per seat.", "Enterprise customers can switch plans from October 8, 2026.", "Existing plans keep their price until January 2027."]) });
};
const BF = { from: "2026-10-06", to: "2026-10-10" };

let bfFirst;
await t("[7.1.5-1] 날짜 범위 백필: 발표일 기간만 · 별도 폴더 · 기간 검증", async () => {
  resetWeb();
  bfWeb();
  const out = path.join(tmp, "bf");
  const hist = path.join(tmp, "bf-hist.json");
  bfFirst = { out, processedFile: path.join(tmp, "bf-p.json"), historyFile: hist };
  const r = await runDaily(baseRun({ env: ENV({ DAILY_MODE: "shadow" }), registry: BF_REG, backfill: BF, today: "2026-10-12", ...bfFirst }));
  eq(r.run.kind, "backfill");
  eq(r.run.window.since, "2026-10-06", "시작일");
  eq(r.run.window.until, "2026-10-10", "종료일");
  eq(r.run.items.map((x) => x.url).sort(), ["https://fx-bf.test/news/gadget-7", "https://fx-bf.test/news/gadget-pricing"], "기간 안 항목만");
  ok(r.outDir.endsWith(path.join("bf", "backfill-2026-10-06_2026-10-10")), `폴더 ${r.outDir}`);
  ok(fs.existsSync(path.join(r.outDir, "report.md")) && fs.existsSync(path.join(r.outDir, "diagnostics.md")), "보고서·진단");
  ok(fs.readFileSync(path.join(r.outDir, "report.md"), "utf8").includes("# AI마중 DAILY 백필 — 2026-10-06 ~ 2026-10-10"), "백필 제목");
  ok(!fs.existsSync(hist), "백필은 소스 상태 기록(마지막 실행일)을 바꾸지 않음");
  for (const [f, to, re] of [["2026-10-10", "2026-10-06", /늦습니다/], ["2026-09-01", "2026-10-10", /백필은 최대 14일/], ["2026-10-10", "2026-10-20", /이후일 수 없습니다/]]) {
    let err = null;
    try {
      await runDaily(baseRun({ env: ENV({ DAILY_MODE: "shadow" }), registry: BF_REG, backfill: { from: f, to }, today: "2026-10-12" }));
    } catch (e) {
      err = e;
    }
    ok(err && re.test(err.message), `기간 검증 ${f}~${to}: ${err?.message}`);
  }
});

await t("[7.1.5-2] 중복 후보 방지: 같은 기간 재실행은 원문을 다시 열지 않고 후보 파일을 늘리지 않음 · 다른 날 DAILY가 다시 추천하지 않음", async () => {
  const before = fs.readdirSync(path.join(bfFirst.out, "backfill-2026-10-06_2026-10-10", "candidates")).sort();
  calls.length = 0;
  const r = await runDaily(baseRun({ env: ENV({ DAILY_MODE: "shadow" }), registry: BF_REG, backfill: BF, today: "2026-10-12", ...bfFirst }));
  eq(fs.readdirSync(path.join(r.outDir, "candidates")).sort(), before, "후보 파일");
  eq(calls.filter((c) => /fx-bf\.test\/news\//.test(c.url)).length, 0, "원문 재요청");
  const pub = r.run.items.filter((x) => x.decision === "PUBLISH");
  if (pub.length) {
    // 백필에서 추천한 항목은 이후 날짜 DAILY에서 '이미 추천함'으로 보류 (중복 추천·PR 충돌 방지)
    const d = await runDaily(baseRun({ date: "2026-10-12", since: "2026-10-06", env: ENV({ DAILY_MODE: "shadow" }), registry: BF_REG, processedFile: bfFirst.processedFile }));
    for (const x of pub) {
      const again = d.run.items.find((y) => y.id === x.id);
      ok(again && again.decision === "HOLD" && again.carriedFrom === "2026-10-10", `다시 추천됨: ${x.title}`);
    }
  }
});

await t("[7.1.5-3] 기존 기사 중복 방지: 같은 원문 · 옮겨진 주소(claude.com/blog → resources/articles)", async () => {
  const ex = { ...existing(), stories: [...STORIES, { slug: "claude-code-mods-typescript", title: "Mods", sourceUrl: "https://claude.com/blog/claude-code-mods", secondarySources: [], sourceTitle: "Customize Claude Code with mods", sourceName: "Claude", eventDate: "2026-10-01", products: [] }] };
  const item = (url) => ({ id: "x", url, canonicalUrl: canonical(url), title: "Mods walkthrough", excerpt: "", publishedAt: "2026-10-01T00:00:00.000Z", sourceName: "Claude" });
  eq(lib.dedupeItem(item("https://claude.com/resources/articles/claude-code-mods"), ex).result, "DUPLICATE", "옮겨진 주소");
  eq(lib.dedupeItem(item("https://fx-a.test/news/old"), ex).result, "DUPLICATE", "같은 원문");
  ok(lib.dedupeItem(item("https://claude.com/resources/articles/other-post"), ex).result !== "DUPLICATE", "다른 글은 중복 아님");
  // 반대 방향: 기사는 새 주소, 수집한 글은 옛 주소
  const ex2 = { ...existing(), stories: [{ ...ex.stories.at(-1), sourceUrl: "https://claude.com/resources/articles/claude-code-mods" }] };
  eq(lib.dedupeItem(item("https://claude.com/blog/claude-code-mods"), ex2).result, "DUPLICATE", "옛 주소로 들어온 글");
  eq(lib.aliasUrl("https://claude.com/blog/x"), "https://claude.com/resources/articles/x");
});

await t("[7.1.5-4] 누락된 공식 발표 복구: 예약 실행이 빠져도 마지막 실행일부터 다시 수집 (최대 7일)", async () => {
  eq(health.catchUpSince({ date: "2026-10-11", windowDays: 2, lastRunDates: ["2026-10-07"] }).since, "2026-10-07", "따라잡기");
  eq(health.catchUpSince({ date: "2026-10-11", windowDays: 2, lastRunDates: ["2026-10-10"] }).since, "2026-10-09", "기본 창");
  eq(health.catchUpSince({ date: "2026-10-11", windowDays: 2, lastRunDates: [] }).since, "2026-10-09", "기록 없음");
  const far = health.catchUpSince({ date: "2026-10-20", windowDays: 2, lastRunDates: ["2026-10-01"] });
  eq([far.since, far.gapFrom], ["2026-10-13", "2026-10-01"], "최대 7일 + 공백 표시");
  // 실제 실행: 10-07에 마지막으로 돌고 10-08~10 예약이 빠진 뒤 10-11 실행 → 10-08 발표를 놓치지 않는다
  resetWeb();
  bfWeb();
  const hist = path.join(tmp, "cu-hist.json");
  fs.writeFileSync(hist, JSON.stringify({ sources: {}, lastRun: "2026-10-07" }));
  const r = await runDaily(baseRun({ date: "2026-10-11", env: ENV({ DAILY_MODE: "shadow" }), registry: BF_REG, historyFile: hist }));
  eq(r.run.window.since, "2026-10-07", "수집 시작일");
  ok(r.run.items.some((x) => x.url === "https://fx-bf.test/news/gadget-pricing"), "10-08 발표 복구");
  // Phase 7.2: 기본 창은 72시간+ (기준일 포함 4일). 10-12 기준 기본 창은 10-09부터라 10-08 발표는 기록이 있어야 다시 본다
  const plain = await runDaily(baseRun({ date: "2026-10-12", env: ENV({ DAILY_MODE: "shadow" }), registry: BF_REG }));
  eq(plain.run.window.since, "2026-10-09", "기본 창");
  ok(!plain.run.items.some((x) => x.url === "https://fx-bf.test/news/gadget-pricing"), "기록이 없으면 기본 창만");
  eq(JSON.parse(fs.readFileSync(hist, "utf8")).lastRun, "2026-10-11", "마지막 실행일 갱신");
  // 워크플로 브랜치 기록(DAILY_LAST_RUN_DATE)도 쓴다
  const viaEnv = await runDaily(baseRun({ date: "2026-10-11", env: ENV({ DAILY_MODE: "shadow", DAILY_LAST_RUN_DATE: "2026-10-08" }), registry: BF_REG }));
  eq(viaEnv.run.window.since, "2026-10-08", "브랜치 기록으로 따라잡기");
  // 사이트맵 순서가 날짜순이 아니어도 상한 안에서 최신 글부터 연다 (Mistral Large 4 누락 사례)
  const old = Array.from({ length: 5 }, (_, i) => `<url><loc>https://fx-mi.test/news/old-${i}</loc><lastmod>2026-10-0${i + 1}T00:00:00Z</lastmod></url>`).join("");
  WEB.set("https://fx-mi.test/sitemap.xml", { body: `<?xml version="1.0"?><urlset>${old}<url><loc>https://fx-mi.test/news/large-4</loc><lastmod>2026-10-09T00:00:00Z</lastmod></url></urlset>`, type: "application/xml" });
  for (let i = 0; i < 5; i++) WEB.set(`https://fx-mi.test/news/old-${i}`, { body: metaPage(`Old ${i}`, `2026-09-1${i}T00:00:00Z`) });
  WEB.set("https://fx-mi.test/news/large-4", { body: metaPage("Introducing Large 4", "2026-10-06T12:00:00Z") });
  const mi = await lib.collectDaily({ date: "2026-10-10", since: "2026-10-01", registry: { sources: [{ id: "fx-mi", name: "FX MI", feedUrl: "https://fx-mi.test/sitemap.xml", sourceType: "official", tier: 1, fetchMode: "sitemap-meta", include: "^https://fx-mi\\.test/news/", enabled: true }] }, limits: { ...lib.loadLimits({}), maxItemsPerSource: 2 }, known: new Map() });
  ok(mi.items.some((x) => x.title === "Introducing Large 4"), "상한 안에서 최신 글");
});

await t("[7.1.5-5] 308 리다이렉트 처리: 따라가서 수집하되 경고로 기록 · 목록 페이지 수집(listing-meta)", async () => {
  resetWeb();
  WEB.set("https://fx-cl.test/blog", redirectedResponse(`<a href="/resources/articles/post-a">A</a><a href="/resources/articles/post-b">B</a><a href="/about">x</a>`, "https://fx-cl.test/resources/articles"));
  WEB.set("https://fx-cl.test/resources/articles/post-a", { body: metaPage("Post A launch", "2026-10-06") });
  WEB.set("https://fx-cl.test/resources/articles/post-b", { body: metaPage("Post B launch", "2026-10-08T10:00:00Z") });
  const reg = { sources: [{ id: "fx-cl", name: "FX CL", feedUrl: "https://fx-cl.test/blog", sourceType: "official", tier: 1, fetchMode: "listing-meta", include: "^https://fx-cl\\.test/resources/articles/[a-z0-9-]+/?$", enabled: true }] };
  const r = await runDaily(baseRun({ env: ENV({ DAILY_MODE: "shadow" }), registry: reg, backfill: BF, today: "2026-10-12" }));
  const s = r.run.sources[0];
  eq([s.http.status, s.http.redirected, s.http.finalUrl, s.matched], [200, true, "https://fx-cl.test/resources/articles", 2], "응답 기록");
  eq(s.health, "WARNING", "리다이렉트는 경고");
  ok(s.healthReasons.some((x) => /리다이렉트/.test(x)), "이유");
  eq(r.run.items.map((x) => x.title).sort(), ["Post A launch", "Post B launch"], "실제 글 수집");
});

await t("[7.1.5-6] 파싱 결과 0건 경고: HTTP 200인데 글 주소 0개 → WARNING, 2회 연속·리다이렉트와 겹치면 DEGRADED (실행 PARTIAL)", async () => {
  resetWeb();
  const sm = `<?xml version="1.0"?><urlset><url><loc>https://fx-sm.test/resources/x</loc></url><url><loc>https://fx-sm.test/about</loc></url></urlset>`;
  WEB.set("https://fx-sm.test/sitemap.xml", { body: sm, type: "application/xml" });
  const reg = { sources: [{ id: "fx-sm", name: "FX SM", feedUrl: "https://fx-sm.test/sitemap.xml", sourceType: "official", tier: 1, fetchMode: "sitemap-meta", include: "^https://fx-sm\\.test/blog/", enabled: true }] };
  const hist = path.join(tmp, "sm-hist.json");
  const a = await runDaily(baseRun({ date: "2026-10-11", env: ENV({ DAILY_MODE: "shadow" }), registry: reg, historyFile: hist }));
  eq([a.run.sources[0].status, a.run.sources[0].health, a.run.sources[0].matched, a.run.sources[0].parsed], ["success", "WARNING", 0, 2], "첫 0개");
  ok(/구조 변경 의심/.test(a.run.sources[0].healthReasons.join()), "이유");
  const same = await runDaily(baseRun({ date: "2026-10-11", env: ENV({ DAILY_MODE: "shadow" }), registry: reg, historyFile: hist }));
  eq(same.run.sources[0].health, "WARNING", "같은 날 재실행은 연속으로 세지 않음");
  const b = await runDaily(baseRun({ date: "2026-10-12", env: ENV({ DAILY_MODE: "shadow" }), registry: reg, historyFile: hist }));
  eq(b.run.sources[0].health, "DEGRADED", "2회 연속");
  eq(b.run.status, "PARTIAL", "실행 상태");
  ok(/\| FX SM \| \*\*DEGRADED\*\* \|/.test(fs.readFileSync(path.join(b.outDir, "report.md"), "utf8")), "보고서 표");
  WEB.set("https://fx-sm.test/sitemap.xml", redirectedResponse(sm, "https://fx-sm.test/new-sitemap.xml", "application/xml"));
  const c = await runDaily(baseRun({ date: "2026-10-11", env: ENV({ DAILY_MODE: "shadow" }), registry: reg }));
  eq(c.run.sources[0].health, "DEGRADED", "리다이렉트 + 0개");
});

await t("[7.1.5-7] 정상적인 0건 구분: 글 목록은 읽히는데 기간 안 새 글이 없으면 OK(NO_NEW) — 연속 5회부터 경고", async () => {
  resetWeb();
  WEB.set("https://fx-q.test/feed.xml", { body: rss([{ title: "Old news", link: "https://fx-q.test/news/old", date: "Mon, 01 Sep 2026 08:00:00 GMT" }]), type: "application/rss+xml" });
  const reg = { sources: [{ id: "fx-q", name: "FX Q", feedUrl: "https://fx-q.test/feed.xml", sourceType: "official", tier: 1, fetchMode: "rss", enabled: true }] };
  const hist = path.join(tmp, "q-hist.json");
  const days = ["2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11", "2026-10-12"];
  const seen = [];
  for (const d of days) {
    const r = await runDaily(baseRun({ date: d, env: ENV({ DAILY_MODE: "shadow" }), registry: reg, historyFile: hist }));
    seen.push([r.run.sources[0].health, r.run.sources[0].healthNote ?? null, r.run.status]);
  }
  eq(seen.slice(0, 4), Array(4).fill(["OK", "NO_NEW", "SUCCESS"]), "1~4회 0건은 정상");
  eq(seen[4][0], "WARNING", "5회 연속");
  eq(seen[4][2], "SUCCESS", "경고만으로 실패 처리하지 않음");
  const h = JSON.parse(fs.readFileSync(hist, "utf8")).sources["fx-q"];
  eq([h.zeroStreak, h.lastOkDate, h.lastItemDate], [5, "2026-10-12", null], "기록");
});

await t("[7.1.5-8] 발표일 미확인: 임의 날짜 없이 후보에서 빼고 보고 · 본문 날짜가 하나뿐일 때만 편집자 확인 표시와 함께 사용", async () => {
  resetWeb();
  WEB.set("https://fx-ls.test/news", { body: `<a href="/claude-model-9">m</a><a href="/claude-model-8">m</a><a href="/news/no-date">n</a>` });
  WEB.set("https://fx-ls.test/claude-model-9", { body: metaPage("Introducing Model 9", null, "<p>October 7, 2026</p><time>October 7, 2026</time>") });
  WEB.set("https://fx-ls.test/claude-model-8", { body: metaPage("Introducing Model 8", null, "<p>October 7, 2026 and October 9, 2026</p>") });
  WEB.set("https://fx-ls.test/news/no-date", { body: metaPage("Undated post", null) });
  const reg = { sources: [
    { id: "fx-launch", name: "FX Launch", feedUrl: "https://fx-ls.test/news", sourceType: "official", tier: 1, fetchMode: "listing-meta", include: "^https://fx-ls\\.test/claude-model-\\d+$", pageDateFallback: true, enabled: true },
    { id: "fx-news", name: "FX News", feedUrl: "https://fx-ls.test/news", sourceType: "official", tier: 1, fetchMode: "listing-meta", include: "^https://fx-ls\\.test/news/[a-z-]+$", enabled: true },
  ] };
  const r = await runDaily(baseRun({ env: ENV({ DAILY_MODE: "shadow" }), registry: reg, backfill: BF, today: "2026-10-12" }));
  eq(r.run.items.map((x) => x.title), ["Introducing Model 9"], "날짜가 하나인 글만 후보");
  const q = JSON.parse(fs.readFileSync(path.join(r.outDir, "run.json"), "utf8"));
  const launch = q.sources.find((s) => s.id === "fx-launch");
  const news = q.sources.find((s) => s.id === "fx-news");
  eq([launch.undated, news.undated], [1, 1], "미확인 수");
  eq([launch.health, news.health], ["WARNING", "WARNING"], "경고");
  eq(news.undatedItems[0].title, "Undated post");
  ok(fs.readFileSync(path.join(r.outDir, "report.md"), "utf8").includes("발행일을 확인하지 못해 후보에서 뺀 글"), "보고서");
  const row = r.run.items[0];
  eq(row.publishedAt.slice(0, 10), "2026-10-07");
  const item = q.items[0];
  ok(item, "run.json 항목");
  // 본문 날짜로 정한 항목은 편집자 확인 표시 (근거 단계까지 간 경우 후보 파일에도)
  const files = fs.existsSync(path.join(r.outDir, "candidates")) ? fs.readdirSync(path.join(r.outDir, "candidates")) : [];
  for (const f of files) ok(JSON.parse(fs.readFileSync(path.join(r.outDir, "candidates", f), "utf8")).needsReview.includes("date_from_page_text"), "date_from_page_text");
  eq(coll.singleVisibleDate("<p>February 31, 2026</p>"), null, "없는 날짜");
  eq(coll.singleVisibleDate("<script>October 1, 2026</script><p>none</p>"), null, "스크립트 안 날짜 무시");
});

await t("[7.1.5-9] Shadow Mode 유지: 백필은 DAILY_MODE=draft여도 shadow · 워크플로 예약 실행 기본 shadow", async () => {
  resetWeb();
  bfWeb();
  const r = await runDaily(baseRun({ env: ENV({ DAILY_MODE: "draft", DAILY_LLM_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "sk-ant-test-FAKEKEY-not-real-0123456789" }), registry: BF_REG, backfill: BF, today: "2026-10-12" }));
  eq(r.run.mode, "shadow");
  eq(r.run.provider, "none");
  ok(/백필은 shadow로만/.test(r.run.modeWarning ?? ""), "경고");
  eq(lib.resolveMode({}).mode, "shadow", "기본값");
});

await t("[7.1.5-10] 유료 API 호출 0회: 백필·따라잡기 실행에서 LLM 엔드포인트 요청 없음", async () => {
  calls.length = 0;
  resetWeb();
  bfWeb();
  let llm = 0;
  await runDaily(baseRun({ env: ENV({ DAILY_MODE: "draft", DAILY_LLM_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "sk-ant-test-FAKEKEY-not-real-0123456789" }), registry: BF_REG, backfill: BF, today: "2026-10-12", fetch: async () => (llm++, new Response("{}", { status: 500 })) }));
  await runDaily(baseRun({ date: "2026-10-11", env: ENV({ DAILY_MODE: "shadow", DAILY_LAST_RUN_DATE: "2026-10-06" }), registry: BF_REG, fetch: async () => (llm++, new Response("{}", { status: 500 })) }));
  eq(llm, 0, "LLM 호출");
  eq(calls.filter((c) => /api\.anthropic\.com|api\.openai\.com/.test(c.url)).length, 0, "LLM 엔드포인트");
});

await t("[7.1.5-11] 기사 발행 0건: 백필·진단은 content/·ingest 추적 파일을 바꾸지 않고 approve를 부르지 않음", async () => {
  const d = spawnSync("git", ["status", "--porcelain", "--", "content", "newsletter", "ingest/candidates", "ingest/editorial", "ingest/state.json", "ingest/newsletter-sent.json"], { cwd: SITE, encoding: "utf8" });
  eq(d.stdout.trim(), "", "기사·후보·편집 데이터 변경");
  for (const f of ["run.mjs", "health.mjs", "diagnose.mjs", "report.mjs"]) {
    const s = fs.readFileSync(path.join(HERE, f), "utf8");
    ok(!/from "\.\/approve\.mjs"|publish\.mjs|saveCandidates|content[\\/"']+stories[^\n]*writeFileSync/.test(s), `${f}에 발행 경로`);
  }
  const run = JSON.parse(fs.readFileSync(path.join(bfFirst.out, "backfill-2026-10-06_2026-10-10", "run.json"), "utf8"));
  ok(fs.readFileSync(path.join(bfFirst.out, "backfill-2026-10-06_2026-10-10", "diagnostics.md"), "utf8").includes("설정은 바꾸지 않았습니다"), "진단은 설정을 바꾸지 않음");
  const dd = diag.diagnoseRun(run);
  eq(dd.thresholds.map((x) => x.threshold), [6, 5, 4], "기준 비교");
  ok(dd.thresholds[0].count <= dd.thresholds[1].count && dd.thresholds[1].count <= dd.thresholds[2].count, "기준을 낮출수록 후보가 늘거나 같음");
});

await t("[7.1.5-12] 뉴스레터 발송 0건: 수집·백필 코드와 DAILY 워크플로에 뉴스레터·Resend 없음", async () => {
  for (const f of ["health.mjs", "diagnose.mjs", "run.mjs", "lib.mjs", "report.mjs"]) {
    const s = fs.readFileSync(path.join(HERE, f), "utf8");
    ok(!/resend|broadcast|newsletter:|emails\.send/i.test(s), `${f}에 발송 코드`);
  }
  ok(!/resend|newsletter/i.test(fs.readFileSync(path.join(SITE, "scripts/ingest/collectors.mjs"), "utf8")), "collectors");
  const wf = fs.readFileSync(path.join(REPO, ".github/workflows/daily-editorial.yml"), "utf8");
  ok(!/RESEND|newsletter:|vercel/i.test(wf), "워크플로");
  eq(calls.filter((c) => /resend\.com|api\.resend/.test(c.url)).length, 0, "Resend 요청");
});

await t("편집 원고 점검: 근거에 없는 숫자 · 직접 써 본 표현 · 관련 기사 미표시 · 기존 원문 중복은 FAIL", async () => {
  const cd = await import("./check-editorial-drafts.mjs");
  const ex = existing();
  const base = {
    handsOn: false,
    relatedStory: null,
    story: {
      slug: "widget-2-ga", title: "Widget 2 정식 출시… 무료 등급 하루 1,000건", status: "draft", publishedAt: null, eventDate: "2026-10-07", editorialDepth: "standard",
      summary: "FX A가 10월 7일 Widget 2를 모든 개발자에게 정식으로 내놨습니다. 하루 1,000건 무료 등급이 생겼고, 유료 등급은 월 20달러부터입니다.",
      facts: ["하루 1,000건까지 무료로 쓸 수 있는 등급이 새로 생겼습니다.", "유료 등급은 개발자 좌석당 월 20달러부터입니다.", "지원 언어는 40개입니다."],
      whyItMatters: "프리뷰로만 열려 있던 Widget이 정식 출시되면서, 개인 개발자도 비용 부담 없이 시험해 볼 수 있게 됐습니다. 다만 성능 수치는 회사 자체 측정입니다.",
      whatChanges: "기존 Widget 1 연동은 2027년 3월 31일까지 그대로 동작하므로 그 전에 옮기면 됩니다.",
      sourceUrl: "https://fx-a.test/news/widget-2", sourceName: "FX A", sourceTitle: "Introducing Widget 2 for developers", sourceType: "official", contentType: "NEWS", category: "PRODUCT_UPDATE", topics: ["ai-coding"], companies: ["FX A"], products: ["Widget 2"], secondarySources: [], priority: 2,
    },
    evidence: [
      { fact: 1, url: "https://fx-a.test/news/widget-2", quote: WIDGET_SENTENCES[1] },
      { fact: 2, url: "https://fx-a.test/news/widget-2", quote: WIDGET_SENTENCES[4] },
      { fact: 3, url: "https://fx-a.test/news/widget-2", quote: WIDGET_SENTENCES[3] },
      { fact: "change", url: "https://fx-a.test/news/widget-2", quote: WIDGET_SENTENCES[5] },
    ],
  };
  const v = (d) => cd.checkDraft(d, ex);
  eq(v(base).verdict !== "FAIL", true, `정상 원고: ${JSON.stringify(v(base).fail)}`);
  const num = structuredClone(base);
  num.story.facts[1] = "유료 등급은 개발자 좌석당 월 25달러부터입니다.";
  ok(v(num).fail.some((x) => /근거에 없는 숫자 25/.test(x)), "숫자 위조");
  const fake = structuredClone(base);
  fake.story.whatChanges += " 직접 써 보니 확실히 빨랐습니다.";
  ok(v(fake).fail.some((x) => /직접 사용한 것처럼/.test(x)), "체험 표현");
  const dupe = structuredClone(base);
  dupe.story.sourceUrl = "https://fx-a.test/news/old";
  ok(v(dupe).fail.some((x) => /기존 기사와 중복/.test(x)), "기존 원문 중복");
  const pub = structuredClone(base);
  pub.story.publishedAt = "2026-10-15";
  pub.story.status = "published";
  ok(v(pub).fail.length >= 2, "발행 상태 원고 거부");
  const noEv = structuredClone(base);
  noEv.evidence = noEv.evidence.filter((e) => e.fact !== 3);
  ok(v(noEv).fail.some((x) => /사실 3에 근거 인용 없음/.test(x)), "근거 없는 사실");
  eq(cd.numberValues("$4 per 1M input tokens · November 30, 2026 · Fourteen months").has(1000000), true);
});

await t("발행 구조 변환(daily:apply-drafts): PUBLISHABLE만 · 기존 slug·HOLD는 멈춤 · dry-run은 아무것도 쓰지 않음", async () => {
  const ap = await import("./apply-editorial-package.mjs");
  const story = {
    slug: "fx-apply-widget-2-ga", title: "Widget 2 정식 출시… 무료 등급 하루 1,000건", status: "draft", publishedAt: null, eventDate: "2026-10-07", editorialDepth: "standard",
    summary: "FX A가 10월 7일 Widget 2를 모든 개발자에게 정식으로 내놨습니다. 하루 1,000건 무료 등급이 생겼고, 유료 등급은 월 20달러부터입니다.",
    facts: ["하루 1,000건까지 무료로 쓸 수 있는 등급이 새로 생겼습니다.", "유료 등급은 개발자 좌석당 월 20달러부터입니다.", "지원 언어는 40개입니다."],
    whyItMatters: "프리뷰로만 열려 있던 Widget이 정식 출시되면서, 개인 개발자도 비용 부담 없이 시험해 볼 수 있게 됐습니다. 다만 성능 수치는 회사 자체 측정입니다.",
    whatChanges: "기존 Widget 1 연동은 2027년 3월 31일까지 그대로 동작하므로 그 전에 옮기면 됩니다.",
    sourceUrl: "https://fx-a.test/news/widget-2", sourceName: "FX A", sourceTitle: "Introducing Widget 2 for developers", sourceType: "official", sourcePublishedAt: "2026-10-07T09:00:00.000Z",
    contentType: "NEWS", category: "PRODUCT_UPDATE", topics: ["ai-coding"], companies: ["FX A"], products: ["Widget 2"], secondarySources: [], priority: 2,
  };
  const evidence = [1, 4, 3].map((n, i) => ({ fact: i + 1, url: story.sourceUrl, quote: WIDGET_SENTENCES[n] })).concat([{ fact: "change", url: story.sourceUrl, quote: WIDGET_SENTENCES[5] }]);
  const draft = { verdict: "PUBLISHABLE", handsOn: false, relatedStory: null, story, evidence };
  const before = spawnSync("git", ["status", "--porcelain", "--", "ingest", "content"], { cwd: SITE, encoding: "utf8" }).stdout;
  const ok1 = ap.buildPackage({ drafts: [draft] }, { runId: "test", now: "2026-10-16T00:00:00.000Z" });
  ok(ok1.ok, ok1.problems.join(" / "));
  eq([ok1.candidates.length, ok1.editorial.length, ok1.editorial[0].editorialDepth, ok1.editorial[0].eventDate, ok1.editorial[0].c], [1, 1, "STANDARD", "2026-10-07", ok1.candidates[0].id]);
  eq(Object.keys(ok1.editorial[0]).includes("publishedAt"), false, "publishedAt은 publish.mjs가 정한다");
  const hold = ap.buildPackage({ drafts: [{ ...draft, verdict: "HOLD" }] }, { runId: "test" });
  ok(!hold.ok && /PUBLISHABLE만/.test(hold.problems[0]), "HOLD 원고");
  const taken = ap.buildPackage({ drafts: [{ ...draft, story: { ...story, slug: "gemini-4-argon" } }] }, { runId: "test" });
  ok(!taken.ok && taken.problems.some((p) => /같은 slug/.test(p)), "기존 slug");
  const badTopic = ap.buildPackage({ drafts: [{ ...draft, story: { ...story, topics: ["no-such-topic"] } }] }, { runId: "test" });
  ok(badTopic.problems.some((p) => /주제 no-such-topic/.test(p)), "주제 목록");
  eq(spawnSync("git", ["status", "--porcelain", "--", "ingest", "content"], { cwd: SITE, encoding: "utf8" }).stdout, before, "dry-run이 파일을 바꿈");
});

await t("실제 기사 데이터 변경 없음 (content/, ingest/ 추적 파일)", async () => {
  // ingest/registry.json은 소스 설정(기사 데이터 아님)이라 제외한다 (Phase 7.1.5에서 Claude 소스 주소를 고침)
  const d = spawnSync("git", ["status", "--porcelain", "--", "content", "ingest", ":!ingest/registry.json"], { cwd: SITE, encoding: "utf8" });
  eq(d.stdout.trim(), "");
});

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${failed ? "FAIL" : "OK"} — DAILY 자동화 점검 ${passed}/${passed + failed} 통과`);
process.exitCode = failed ? 1 : 0;
