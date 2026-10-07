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
const ENV = (extra = {}) => ({ DAILY_AUTOMATION_ENABLED: "true", DAILY_LLM_PROVIDER: "mock", ...extra });
const baseRun = (extra = {}) => ({ date: DATE, out: path.join(tmp, `out-${Math.random().toString(36).slice(2)}`), registry: REGISTRY, existing: existing(), processedFile: path.join(tmp, `p-${Math.random().toString(36).slice(2)}.json`), retryDelayMs: 1, log: quiet, ...extra });

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
  eq([l.maxPublishPerDay, l.maxLlmCalls, l.llmRetries, l.maxEvidenceFetches], [12, 12, 2, 25]);
  const d = lib.loadLimits({});
  eq([d.maxPublishPerDay, d.maxEvidenceFetches, d.maxLlmCalls], [6, 12, 6], "기본값");
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
  for (const s of ["# AI마중 DAILY — 2026-10-07", "**상태: PARTIAL", "## 발행 추천", "## 보류", "## 제외", "## 소스 상태", "FX B — **blocked**", "FX C — **failed**", "## 비용", "자동으로 발행하지 않습니다"]) ok(md.includes(s), `보고서에 '${s}' 없음`);
  ok(md.split("\n").length < 120, "보고서가 너무 김");
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
  ok(/cron: "0 22 \* \* \*"/.test(wf), "22:00 UTC = 07:00 KST");
  const pushes = wf.split("\n").filter((l) => /git push/.test(l));
  eq(pushes.map((l) => l.trim()), ['git push origin "HEAD:refs/heads/$B"'], "push 명령");
  ok(/B="automation\/daily-\$D"/.test(wf) && /case "\$B" in automation\/daily-\*\)/.test(wf), "브랜치 이름 고정");
  ok(!/push.*(master|main)\b|--force|-f\b/.test(pushes.join("\n")), "master·force push");
  ok(!/vercel|newsletter|daily:approve|publish:/.test(wf), "배포·뉴스레터·승인·발행이 워크플로에 있음");
  ok(/gh pr list --head "\$B" --state open/.test(wf), "같은 날짜 PR 재사용");
  ok(!/ANTHROPIC_API_KEY[^:]*\becho|echo .*ANTHROPIC/.test(wf), "키 출력");
  // Shadow Mode: LLM 키를 넘기지 않고 공급자 none 고정
  ok(/DAILY_MODE: shadow/.test(wf) && /DAILY_LLM_PROVIDER: none/.test(wf), "Shadow 고정");
  ok(!/secrets\.ANTHROPIC_API_KEY|ANTHROPIC_API_KEY:/.test(wf), "LLM 키가 워크플로에 전달됨");
  // 보고서 fallback: Summary + artifact는 항상, PR은 실패해도 계속
  ok(/actions\/upload-artifact@v4/.test(wf) && /name: daily-report-\$\{\{ steps\.d\.outputs\.date \}\}/.test(wf) && /overwrite: true/.test(wf), "artifact 업로드");
  const step = (name) => wf.split(/\n      - name: /).find((x) => x.startsWith(name)) ?? "";
  ok(/if: always\(\)/.test(step("Upload report artifact")), "artifact는 항상");
  ok(/continue-on-error: true/.test(step("Branch + PR")), "PR 실패가 artifact를 막지 않음");
  ok(/GITHUB_STEP_SUMMARY/.test(step("Job summary")), "Summary");
  ok(wf.indexOf("Upload report artifact") < wf.indexOf("Branch + PR"), "artifact가 PR보다 먼저");
});
await t("자동화 코드: 뉴스레터 발송·Resend·content 직접 쓰기·git push 없음", async () => {
  for (const f of ["lib.mjs", "run.mjs", "providers.mjs", "report.mjs"]) {
    const s = fs.readFileSync(path.join(HERE, f), "utf8");
    ok(!/resend|broadcast|newsletter\/send|emails\.send|git push|child_process/i.test(s.replace(/뉴스레터는 만들거나 보내지 않는다|뉴스레터 후보|뉴스레터도 만들거나 보내지 않습니다/g, "")), `${f}에 발송·push 코드`);
    ok(!/content[\\/"']+stories[^\n]*writeFileSync|writeFileSync[^\n]*content[\\/]stories/.test(s), `${f}가 content/stories에 씀`);
  }
});
await t("실제 기사 데이터 변경 없음 (content/, ingest/ 추적 파일)", async () => {
  const d = spawnSync("git", ["status", "--porcelain", "--", "content", "ingest"], { cwd: SITE, encoding: "utf8" });
  eq(d.stdout.trim(), "");
});

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${failed ? "FAIL" : "OK"} — DAILY 자동화 점검 ${passed}/${passed + failed} 통과`);
process.exitCode = failed ? 1 : 0;
