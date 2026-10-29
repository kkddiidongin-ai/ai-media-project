#!/usr/bin/env node
/**
 * Phase 7.2 파이프라인 점검: npm run qa:pipeline
 * 가짜 fetch와 임시 폴더로만 돈다 (외부 사이트·LLM·Vercel에 요청하지 않음, 실제 기사 데이터 변경 없음).
 *   A 후보 0건 · B 3건 · C 30건 · D 100건 이상(배치 넘김 → 대기열 → 다음 실행) · E 같은 회사 다수 · F 같은 기사 중복 수집 ·
 *   G 공식 원문·소스 접근 실패 · H 실행 도중 중단 · I 예약 실행 누락 · J Vercel 배포 실패
 *   + 소스 페이지네이션 이월 · 피드 범위 부족 표시 · 무료 생성(Gemini) 한도 · 원고 내보내기 · 발행 되돌리기
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
  calls.push({ url, method: init.method ?? "GET" });
  const h = WEB.get(url);
  if (typeof h === "function") return h(init);
  if (h) return new Response(h.body, { status: h.status ?? 200, headers: { "content-type": h.type ?? "text/html" } });
  if (url.endsWith("/robots.txt")) return new Response("", { status: 404 });
  return new Response("not found", { status: 404 });
};

const lib = await import("../daily/lib.mjs");
const { runDaily } = await import("../daily/run.mjs");
const { loadQueue } = await import("../daily/queue.mjs");
const providers = await import("../daily/providers.mjs");
const pub = await import("./publish.mjs");

let passed = 0;
let failed = 0;
// QA_ONLY=이름 일부: 그 이름이 들어간 시험만 돈다 (전체는 오래 걸림)
const t = async (name, fn) => {
  if (process.env.QA_ONLY && !name.includes(process.env.QA_ONLY)) return;
  try {
    await fn();
    passed++;
    console.log(`ok    ${name}`);
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
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pipeline-qa-"));
const rid = () => Math.random().toString(36).slice(2);

// ---------- 고정 데이터 ----------
const DATE = "2026-10-16";
const rss = (items) =>
  `<?xml version="1.0"?><rss><channel>${items.map((i) => `<item><title>${i.title}</title><link>${i.link}</link><pubDate>${i.date}</pubDate><description>${i.desc ?? ""}</description></item>`).join("")}</channel></rss>`;
const PRODUCTS = ["Alpha", "Bravo", "Cobalt", "Delta", "Ember", "Falcon", "Garnet", "Harbor", "Indigo", "Juniper", "Kestrel", "Lumen", "Mosaic", "Nimbus", "Onyx", "Prism", "Quasar", "Raven", "Sierra", "Tundra"];
const nameOf = (i) => `${PRODUCTS[i % PRODUCTS.length]}${Math.floor(i / PRODUCTS.length) || ""} ${i + 2}`; // 서로 다른 제품명
/** 서로 다른 발표 n건: 각자 다른 호스트(원문 요청 간격 대기 없음) · 근거 페이지 포함 */
function announcements(prefix, n, { company = "FX Co", date = "Thu, 15 Oct 2026 09:00:00 GMT", status = 200 } = {}) {
  const items = [];
  for (let i = 0; i < n; i++) {
    const name = nameOf(i);
    const host = `${prefix}${i}.test`;
    const link = `https://${host}/news/${name.toLowerCase().replace(/\s+/g, "-")}`;
    items.push({ title: `Introducing ${name} for developers`, link, date, desc: `${name} is now available to all developers worldwide with a new free tier, 3x faster responses and support for 40 languages starting today in the API.` });
    const sentences = [
      `${name} is now available to all developers worldwide in the API starting October 15, 2026.`,
      `The new free tier for ${name} includes 1,000 requests per day for every account at no cost.`,
      `${name} responses are 3x faster than the previous version in internal benchmarks across 40 languages.`,
      `${name} supports 40 languages and adds structured output for agent workflows.`,
      `Pricing for the ${name} paid tier starts at $20 per month per developer seat.`,
      `Existing integrations keep working until March 31, 2027, after which the old version of ${name} is retired.`,
      `Enterprise customers of ${company} can request higher limits for ${name} through their account team.`,
    ];
    WEB.set(link, status === 200 ? { body: `<html><head><meta property="article:published_time" content="2026-10-15T09:00:00Z"></head><body><article>${sentences.map((s) => `<p>${s}</p>`).join("")}</article></body></html>` } : { status, body: "blocked" });
  }
  return items;
}
const src = (id, feedUrl, extra = {}) => ({ id, name: extra.name ?? id.toUpperCase(), feedUrl, sourceType: "official", tier: 1, fetchMode: "rss", enabled: true, ...extra });
const EMPTY = () => ({ stories: [], candidates: new Map(), editorialIds: new Set(), editorialSlugs: new Set(), topics: ["ai-coding", "ai-agent"] });
const ENV = (extra = {}) => ({ DAILY_AUTOMATION_ENABLED: "true", DAILY_MODE: "shadow", ...extra });
const base = (extra = {}) => {
  const d = path.join(tmp, rid());
  return { date: DATE, out: path.join(d, "out"), existing: EMPTY(), processedFile: path.join(d, "processed.json"), historyFile: path.join(d, "history.json"), queueFile: path.join(d, "queue.json"), retryDelayMs: 1, log: () => {}, env: ENV(), ...extra };
};
/** 가짜 시계: sleep하면 시간이 그만큼 흐른다 (실제로 기다리지 않음) */
const fakeClock = (t0 = Date.parse("2026-10-29T03:00:00Z")) => {
  let t = t0;
  const slept = [];
  return { now: () => t, sleep: async (ms) => (slept.push(ms), (t += ms)), advance: (ms) => (t += ms), slept };
};
const decisions = (r) => r.run.items.reduce((m, x) => ((m[x.decision] = (m[x.decision] ?? 0) + 1), m), {});

// ---------- A~E ----------
await t("A. 하루 후보 0건: SUCCESS · 대기열 비어 있음 · 완료", async () => {
  WEB.set("https://fx-a0.test/feed.xml", { body: rss([]), type: "application/rss+xml" });
  const r = await runDaily(base({ registry: { sources: [src("fx-a0", "https://fx-a0.test/feed.xml")] } }));
  eq([r.status, r.run.counts.collected, r.run.counts.PUBLISH, r.run.pipeline.complete], ["SUCCESS", 0, 0, true]);
});

await t("B. 하루 후보 3건: 3건 모두 발행 추천 (총량 상한 없음)", async () => {
  WEB.set("https://fx-b.test/feed.xml", { body: rss(announcements("fx-b", 3)), type: "application/rss+xml" });
  const r = await runDaily(base({ registry: { sources: [src("fx-b", "https://fx-b.test/feed.xml")] } }));
  eq(decisions(r).PUBLISH, 3, JSON.stringify(r.run.items.map((x) => [x.decision, x.reasons.at(-1)])));
  eq(r.run.limits.maxPublishPerDay, 0, "기본 = 상한 없음");
});

await t("C. 하루 후보 30건: 30건 모두 근거 확인·발행 추천 (배치 40 안)", async () => {
  WEB.set("https://fx-c.test/feed.xml", { body: rss(announcements("fx-c", 30)), type: "application/rss+xml" });
  const r = await runDaily(base({ registry: { sources: [src("fx-c", "https://fx-c.test/feed.xml")] } }));
  eq([r.run.counts.collected, r.run.counts.evidenceChecked, decisions(r).PUBLISH], [30, 30, 30]);
  eq(r.run.pipeline.pending.evidence, 0);
});

await t("D. 하루 후보 120건: 배치(40)를 넘는 80건은 버리지 않고 대기열 → 3번의 실행으로 120건 모두 처리", async () => {
  WEB.set("https://fx-d.test/feed.xml", { body: rss(announcements("fx-d", 120)), type: "application/rss+xml" });
  const o = base({ registry: { sources: [src("fx-d", "https://fx-d.test/feed.xml")] } });
  const r1 = await runDaily(o);
  eq([r1.run.counts.collected, r1.run.counts.evidenceChecked, r1.run.pipeline.pending.evidence, r1.status], [120, 40, 80, "INCOMPLETE"]);
  ok(r1.run.items.filter((x) => x.queued === "evidence").length === 80, "대기 표시");
  ok(fs.readFileSync(path.join(r1.outDir, "report.md"), "utf8").includes("근거 확인 대기 **80**건"), "보고서에 남은 일");
  // 이후 실행은 기간이 지나 피드에서 빠져도(빈 피드) 대기열에서 이어서 처리
  WEB.set("https://fx-d.test/feed.xml", { body: rss([{ title: "Old note", link: "https://fx-d-old.test/old", date: "Mon, 01 Sep 2026 09:00:00 GMT" }]), type: "application/rss+xml" });
  const published = new Set(r1.run.items.filter((x) => x.decision === "PUBLISH").map((x) => x.id));
  const r2 = await runDaily({ ...o, date: "2026-10-17" });
  eq([r2.run.counts.carriedFromQueue, r2.run.counts.evidenceChecked, r2.run.pipeline.pending.evidence], [80, 40, 40]);
  for (const x of r2.run.items.filter((x) => x.decision === "PUBLISH")) published.add(x.id);
  const r3 = await runDaily({ ...o, date: "2026-10-18" });
  for (const x of r3.run.items.filter((x) => x.decision === "PUBLISH")) published.add(x.id);
  eq([r3.run.pipeline.pending.evidence, r3.status, published.size], [0, "SUCCESS", 120], "120건 모두 추천");
});

await t("E. 같은 회사 발표 10건: 서로 다른 발표면 회사별 상한 없이 모두 추천", async () => {
  WEB.set("https://fx-e.test/feed.xml", { body: rss(announcements("fx-e", 10, { company: "Same Corp" })), type: "application/rss+xml" });
  const r = await runDaily(base({ registry: { sources: [src("fx-e", "https://fx-e.test/feed.xml", { name: "Same Corp" })] } }));
  const p = r.run.items.filter((x) => x.decision === "PUBLISH");
  eq([p.length, new Set(p.map((x) => x.company)).size], [10, 1]);
  ok(!r.run.items.some((x) => x.capStage === "diversity" || x.capStage === "final"), "다양성·총량 상한으로 보류된 항목 없음");
  // 예전 방식(상한)을 명시하면 그대로 동작한다
  const capped = await runDaily(base({ env: ENV({ DAILY_MAX_PUBLISH: "6" }), registry: { sources: [src("fx-e", "https://fx-e.test/feed.xml", { name: "Same Corp" })] } }));
  ok(decisions(capped).PUBLISH < 10, "상한을 주면 예전처럼");
});

await t("F. 같은 기사 중복 수집: 같은 URL은 한 번만 · 다른 곳에 실린 같은 발표는 하나만 추천 · 재실행해도 늘지 않음", async () => {
  const items = announcements("fx-f", 2);
  WEB.set("https://fx-f1.test/feed.xml", { body: rss(items), type: "application/rss+xml" });
  WEB.set("https://fx-f2.test/feed.xml", { body: rss([items[0], { ...items[1], link: "https://mirror-fx-f.test/news/copy" }]), type: "application/rss+xml" });
  WEB.set("https://mirror-fx-f.test/news/copy", WEB.get(items[1].link));
  const o = base({ registry: { sources: [src("fx-f1", "https://fx-f1.test/feed.xml"), src("fx-f2", "https://fx-f2.test/feed.xml")] } });
  const r = await runDaily(o);
  eq(r.run.counts.collected, 3, "같은 URL은 한 번만 (2 + 다른 URL 1)");
  eq(decisions(r).PUBLISH, 2, "같은 발표 두 곳 → 하나만 추천");
  ok(r.run.items.some((x) => x.decision === "EXCLUDE" && /같은 날 다른 출처/.test(x.reasons.join())), "중복 표시");
  const again = await runDaily(o);
  eq([again.run.counts.collected, decisions(again).PUBLISH], [3, 2], "재실행");
});

await t("G. 접근 실패: 원문 403은 추천하지 않음 · 실패한 소스는 재시도 대기열에 남고 다음 실행이 그 시작일부터 다시 수집", async () => {
  const blocked = announcements("fx-g", 2, { status: 403 });
  WEB.set("https://fx-g.test/feed.xml", { body: rss(blocked), type: "application/rss+xml" });
  const r = await runDaily(base({ registry: { sources: [src("fx-g", "https://fx-g.test/feed.xml")] } }));
  ok(!r.run.items.some((x) => x.decision === "PUBLISH"), "원문 403 → 추천 안 함");
  // 소스 자체 실패
  WEB.set("https://fx-g2.test/feed.xml", { status: 500, body: "boom" });
  const o = base({ date: "2026-10-12", registry: { sources: [src("fx-g2", "https://fx-g2.test/feed.xml")] } });
  const f = await runDaily(o);
  eq(f.status, "FAILED");
  const q = loadQueue(o.queueFile);
  eq(q.retry["fx-g2"]?.since, "2026-10-09", "재시도 시작일");
  // 다음 실행(4일 뒤): 기본 창은 10-13부터지만 실패했던 10-09부터 다시 본다
  WEB.set("https://fx-g2.test/feed.xml", { body: rss(announcements("fx-g2x", 1, { date: "Sat, 10 Oct 2026 09:00:00 GMT" })), type: "application/rss+xml" });
  const n = await runDaily({ ...o, date: "2026-10-16" });
  eq(n.run.sources[0].since, "2026-10-09", "재시도 소스의 시작일");
  eq(n.run.counts.collected, 1, "실패 기간 발표 보충");
  eq(loadQueue(o.queueFile).retry["fx-g2"], undefined, "성공하면 재시도 목록에서 빠짐");
});

await t("H. 실행 도중 중단: 시간 예산 초과 → 남은 일 대기열 · 예외로 끊겨도 체크포인트에서 이어서 처리", async () => {
  WEB.set("https://fx-h.test/feed.xml", { body: rss(announcements("fx-h", 12)), type: "application/rss+xml" });
  const o = base({ env: ENV({ DAILY_TIME_BUDGET_MIN: "1" }), registry: { sources: [src("fx-h", "https://fx-h.test/feed.xml")] } });
  let n = 0;
  const r = await runDaily({ ...o, clock: () => 1_000_000 + n++ * 20_000 }); // 호출마다 20초 → 몇 건 뒤 예산 초과
  eq(r.status, "INCOMPLETE");
  ok(r.run.pipeline.timeBudgetExceeded && r.run.pipeline.pending.evidence > 0 && r.run.counts.evidenceChecked < 12, JSON.stringify(r.run.pipeline));
  const done = await runDaily({ ...o, env: ENV(), date: "2026-10-17" });
  eq([done.run.pipeline.pending.evidence, done.status], [0, "SUCCESS"], "다음 실행에서 마저 처리");
  // 예외로 끊긴 경우: 처리 전에 대기열에 올려 두었으므로 남은 후보가 사라지지 않는다
  WEB.set("https://fx-h2.test/feed.xml", { body: rss(announcements("fx-h2", 8)), type: "application/rss+xml" });
  const o2 = base({ registry: { sources: [src("fx-h2", "https://fx-h2.test/feed.xml")] } });
  let k = 0;
  let crashed = false;
  try {
    await runDaily({ ...o2, clock: () => {
      if (++k > 5) throw new Error("runner killed");
      return 0;
    } });
  } catch {
    crashed = true;
  }
  ok(crashed, "중단 재현");
  eq(Object.values(loadQueue(o2.queueFile).items).filter((x) => x.stage === "evidence").length, 8, "끊긴 시점의 후보 8건이 대기열에 남음");
  WEB.set("https://fx-h2.test/feed.xml", { body: rss([{ title: "Old note", link: "https://fx-h2-old.test/old", date: "Mon, 01 Sep 2026 09:00:00 GMT" }]), type: "application/rss+xml" });
  const resumed = await runDaily({ ...o2, date: "2026-10-17" });
  eq([resumed.run.counts.carriedFromQueue, resumed.run.items.filter((x) => x.decision === "PUBLISH").length, resumed.run.pipeline.pending.evidence], [8, 8, 0]);
});

await t("I. 예약 실행 누락: 마지막 실행일부터 따라잡기 + 대기열 · 07:07/19:07 KST 두 번 예약 · 상태는 브랜치에도 보존", async () => {
  WEB.set("https://fx-i.test/feed.xml", { body: rss(announcements("fx-i", 2, { date: "Mon, 12 Oct 2026 09:00:00 GMT" })), type: "application/rss+xml" });
  const o = base({ registry: { sources: [src("fx-i", "https://fx-i.test/feed.xml")] } });
  fs.mkdirSync(path.dirname(o.historyFile), { recursive: true });
  fs.writeFileSync(o.historyFile, JSON.stringify({ sources: {}, lastRun: "2026-10-11" }));
  const r = await runDaily(o);
  eq([r.run.window.since, r.run.counts.collected], ["2026-10-11", 2], "빠진 날 발표 보충");
  const wf = fs.readFileSync(path.join(REPO, ".github/workflows/daily-editorial.yml"), "utf8");
  ok(/cron: "7 22 \* \* \*"/.test(wf) && /cron: "7 10 \* \* \*"/.test(wf), "두 번 예약");
  ok(/Restore pipeline state \(branch\)/.test(wf) && /Save pipeline state \(branch\)/.test(wf) && /automation\/pipeline-state/.test(wf), "대기열·처리 기록 보존");
  ok(/Last run \(catch-up\)/.test(wf), "따라잡기");
});

// ---------- 페이지네이션 · 범위 ----------
await t("소스 페이지네이션: 글 주소 150개를 배치 60개씩 열고 남은 주소는 다음 실행으로 — 3번에 모두 수집", async () => {
  const locs = [];
  for (let i = 0; i < 150; i++) {
    const loc = `https://fx-sm.test/blog/post-${i}`;
    locs.push(`<url><loc>${loc}</loc><lastmod>2026-10-15T00:00:00Z</lastmod></url>`);
    WEB.set(loc, { body: `<html><head><meta property="og:title" content="Post ${i}"><meta property="article:published_time" content="2026-10-15T08:00:00Z"></head><body>x</body></html>` });
  }
  WEB.set("https://fx-sm.test/sitemap.xml", { body: `<?xml version="1.0"?><urlset>${locs.join("")}</urlset>`, type: "application/xml" });
  const o = base({ registry: { sources: [{ id: "fx-sm", name: "FX SM", feedUrl: "https://fx-sm.test/sitemap.xml", sourceType: "official", tier: 1, fetchMode: "sitemap-meta", include: "^https://fx-sm\\.test/blog/", enabled: true }] } });
  const r1 = await runDaily(o);
  eq([r1.run.counts.collected, r1.run.pipeline.pending.meta, r1.status], [60, 90, "INCOMPLETE"]);
  ok(r1.run.pipeline.coverageGaps.some((g) => g.id === "fx-sm" && /이월/.test(g.reason)), "범위 부족 표시");
  const r2 = await runDaily({ ...o, date: "2026-10-17" });
  const r3 = await runDaily({ ...o, date: "2026-10-18" });
  eq([r2.run.counts.collected, r3.run.counts.collected, r3.run.pipeline.pending.meta], [60, 30, 0]);
});

await t("피드 범위 부족: 피드의 가장 오래된 항목이 시작일보다 늦으면 '놓쳤을 수 있음'으로 표시 (실패로 숨기지 않음)", async () => {
  WEB.set("https://fx-short.test/feed.xml", { body: rss(announcements("fx-short", 3, { date: "Fri, 16 Oct 2026 01:00:00 GMT" })), type: "application/rss+xml" });
  const r = await runDaily(base({ registry: { sources: [src("fx-short", "https://fx-short.test/feed.xml")] } }));
  const s = r.run.sources[0];
  eq(s.coverage.complete, false);
  ok(/놓쳤을 수 있음/.test(s.coverage.reason), s.coverage.reason);
  ok(fs.readFileSync(path.join(r.outDir, "report.md"), "utf8").includes("수집 범위가 기간 전체를 덮지 못한 소스"), "보고서");
});

// ---------- 원고 생성 (무료 등급) ----------
await t("무료 생성(Gemini): 확인 표시 없으면 호출 0 · 한도(429)면 남은 원고는 작성 대기 · 빈 원고를 만들지 않음", async () => {
  WEB.set("https://fx-gm.test/feed.xml", { body: rss(announcements("fx-gm", 3)), type: "application/rss+xml" });
  const reg = { sources: [src("fx-gm", "https://fx-gm.test/feed.xml")] };
  let llm = 0;
  const no = await runDaily(base({ env: ENV({ DAILY_MODE: "draft", DAILY_LLM_PROVIDER: "gemini", GEMINI_API_KEY: "test-not-real" }), registry: reg, fetch: async () => (llm++, new Response("{}")) }));
  eq(llm, 0, "확인 표시 없음 → 호출 0");
  ok(/FREE_TIER_CONFIRMED/.test(no.run.draftBlocked ?? ""), no.run.draftBlocked);
  eq(no.run.pipeline.pending.draft, 3, "작성 대기");
  // 첫 호출은 한도 초과 → 그 실행은 더 부르지 않음
  llm = 0;
  const env = ENV({ DAILY_MODE: "draft", DAILY_LLM_PROVIDER: "gemini", GEMINI_API_KEY: "test-not-real", DAILY_GEMINI_FREE_TIER_CONFIRMED: "true", DAILY_GEMINI_BILLING_TIER: "free" });
  const q = await runDaily(base({ env, registry: reg, fetch: async () => (llm++, new Response("{}", { status: 429 })) }));
  eq([llm, q.run.llm.generation.quotaHit, q.run.pipeline.pending.draft, q.run.counts.drafts], [1, true, 3, 0]);
  // 예약 실행에서도 무료 생성은 허용, 유료(anthropic)는 shadow
  eq(lib.resolveMode({ DAILY_MODE: "draft", GITHUB_EVENT_NAME: "schedule", DAILY_LLM_PROVIDER: "gemini", DAILY_GEMINI_FREE_TIER_CONFIRMED: "true" }).mode, "draft");
  eq(lib.resolveMode({ DAILY_MODE: "draft", GITHUB_EVENT_NAME: "schedule", DAILY_LLM_PROVIDER: "anthropic" }).mode, "shadow");
  eq(providers.GEMINI_FREE_MODELS.includes(providers.GEMINI_DEFAULT_MODEL), true);
});

await t("무료 생성 성공: 원고·QA·생성 통계 기록, 응답 형식 오류는 실패로 (허위 원고 없음)", async () => {
  WEB.set("https://fx-gs.test/feed.xml", { body: rss(announcements("fx-gs", 2)), type: "application/rss+xml" });
  const env = ENV({ DAILY_MODE: "draft", DAILY_LLM_PROVIDER: "gemini", GEMINI_API_KEY: "test-not-real", DAILY_GEMINI_FREE_TIER_CONFIRMED: "true", DAILY_GEMINI_BILLING_TIER: "free" });
  let n = 0;
  const reply = (draft) => new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(draft) }] } }], usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 400 } }), { status: 200 });
  const clock = fakeClock();
  const r = await runDaily(base({ env, now: clock.now, sleep: clock.sleep, registry: { sources: [src("fx-gs", "https://fx-gs.test/feed.xml")] }, fetch: async (url, init) => {
    n++;
    ok(String(url).includes("generativelanguage.googleapis.com") && init.headers["x-goog-api-key"], "엔드포인트·키 헤더");
    if (n === 2) return new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "not json" }] } }] }), { status: 200 });
    return reply({ title: "Alpha 2 개발자용 정식 출시", summary: "FX Co가 Alpha 2를 전 세계 개발자에게 공개했습니다.", category: "PRODUCT_UPDATE", topics: ["ai-coding"], companies: ["FX Co"], products: ["Alpha 2"], facts: [{ text: "Alpha 2는 10월 15일부터 API로 쓸 수 있습니다.", evidence: ["E1"] }, { text: "무료 등급은 하루 1,000건 요청을 제공합니다.", evidence: ["E2"] }], why: { text: "무료 등급이 생겨 개인 개발자도 시험해 볼 수 있습니다.", evidence: ["E2"] }, change: { text: "유료 등급은 좌석당 월 20달러부터입니다.", evidence: ["E5"] }, checks: [{ text: "기존 연동은 2027년 3월 31일까지 동작합니다.", evidence: ["E6"] }], unknowns: ["한국 제공 여부는 원문에 없음"], editorialDepth: "SHORT", insufficient: false });
  } }));
  eq([r.run.llm.generation.attempted, r.run.llm.generation.ok, r.run.llm.generation.failed], [2, 1, 1]);
  eq(r.run.pipeline.pending.draft, 1, "실패한 1건은 작성 대기로");
  eq(r.run.llm.estimatedCostUsd, 0, "무료 등급 비용 0");
  // 연결: 초안 → 편집 원고 내보내기 → 승인 PR 본문 (모의 응답 — 실제 Gemini 호출 아님)
  const { exportRun, renderApprovalSection } = await import("./export-drafts.mjs");
  const doc = exportRun(r.outDir, { existing: EMPTY() });
  eq(doc.drafts.length, 1, "만든 초안 1건만 내보냄 (실패 1건은 작성 대기)");
  const d0 = doc.drafts[0];
  eq([d0.handsOn, d0.story.status, d0.story.publishedAt, d0.story.eventDate, d0.generation.provider], [false, "draft", null, "2026-10-15", "gemini"]);
  const md = renderApprovalSection(doc, { draftsRef: "automation/daily-2026-10-16", draftsPath: "site/ingest/daily/2026-10-16/drafts/editorial-drafts.json" });
  ok(md.includes(d0.story.title) && /승인 대기|수정·재검증 대기/.test(md) && md.includes("PR을 승인·병합해도 사이트에 공개되지 않습니다"), md.slice(0, 300));
  const wf = fs.readFileSync(path.join(REPO, ".github/workflows/daily-editorial.yml"), "utf8");
  ok(/INPUT_MODE" = "free-draft" .*then M=draft; P=gemini; fi/.test(wf), "수동 시험 free-draft");
  ok(/--append-report/.test(wf) && /승인 대기 원고/.test(wf), "PR 본문·제목에 승인 대기 원고");
});

// ---------- Phase 7.3 Gemini 무료 전용 안전장치 (모의 응답만 — 실제 Gemini 호출 없음) ----------
{
  const G = await import("../daily/gemini-guard.mjs");
  const KEY = "AIzaTESTKEYnotReal0123456789abcdefXYZ";
  const cand = { title: "t", sourceName: "S", url: "https://x.test/a", publishedAt: "2026-10-15T00:00:00Z" };
  const ev = { ledger: [] };
  const okReply = () => new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: '{"title":"x"}' }] } }], usageMetadata: {} }), { status: 200 });
  const gctx = ({ env = {}, state = {}, fetch, clock = fakeClock(), maxLlmCalls = 50 } = {}) => ({
    provider: "gemini",
    env: { GEMINI_API_KEY: KEY, DAILY_GEMINI_FREE_TIER_CONFIRMED: "true", DAILY_GEMINI_BILLING_TIER: "free", ...env },
    limits: { ...lib.DEFAULTS, maxLlmCalls },
    budget: { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 },
    categories: ["PRODUCT_UPDATE"],
    topics: [],
    fetch,
    geminiState: state,
    persist: () => {},
    now: clock.now,
    sleep: clock.sleep,
  });
  const counter = (reply = okReply) => {
    const f = async (...a) => (f.n++, reply(...a));
    f.n = 0;
    return f;
  };

  await t("7.3-1 무료 확인 표시 없으면 호출 차단", async () => {
    const f = counter();
    const env = { DAILY_GEMINI_FREE_TIER_CONFIRMED: "" };
    ok(/FREE_TIER_CONFIRMED/.test(providers.providerBlocker("gemini", { GEMINI_API_KEY: KEY, DAILY_GEMINI_BILLING_TIER: "free" }) ?? ""), "시작 확인");
    const r = await providers.generateArticle(cand, ev, gctx({ env, fetch: f }));
    eq([r.status, f.n], ["skipped", 0]);
  });

  await t("7.3-2 결제 등급이 유료·비어 있음·확인 불가면 호출 차단", async () => {
    for (const tier of ["paid", "", "tier1", "unknown"]) {
      const f = counter();
      ok(providers.providerBlocker("gemini", { GEMINI_API_KEY: KEY, DAILY_GEMINI_FREE_TIER_CONFIRMED: "true", DAILY_GEMINI_BILLING_TIER: tier }), `시작 확인 ${tier}`);
      const r = await providers.generateArticle(cand, ev, gctx({ env: { DAILY_GEMINI_BILLING_TIER: tier }, fetch: f }));
      eq([r.status, f.n], ["skipped", 0], `등급 '${tier}'`);
    }
    eq(providers.providerBlocker("gemini", { GEMINI_API_KEY: KEY, DAILY_GEMINI_FREE_TIER_CONFIRMED: "true", DAILY_GEMINI_BILLING_TIER: "free" }), null);
  });

  await t("7.3-3 무료 목록에 없는 모델이면 호출 차단 (다른 모델로 바꾸지 않음)", async () => {
    const f = counter();
    const r = await providers.generateArticle(cand, ev, gctx({ env: { DAILY_GEMINI_MODEL: "gemini-3.8-pro" }, fetch: f }));
    eq([r.status, r.model, f.n], ["skipped", "gemini-3.8-pro", 0]);
    eq(providers.GEMINI_DEFAULT_MODEL, "gemini-3.8-flash");
  });

  await t("7.3-4 하루 예산 8회 — 실패한 요청도 셈, 9번째는 호출 없이 중단, 다음 날(태평양 시간) 새로 셈", async () => {
    const clock = fakeClock();
    const state = {};
    let n = 0;
    const f = async () => (++n % 2 ? new Response("{}", { status: 500 }) : okReply());
    const res = [];
    for (let i = 0; i < 10; i++) res.push((await providers.generateArticle(cand, ev, gctx({ state, fetch: f, clock }))).status);
    eq(n, 8, "요청 수");
    eq(state.calls, 8);
    eq(res.slice(8), ["skipped", "skipped"]);
    ok(res.slice(0, 8).includes("failed"), "실패도 예산에 포함");
    // 설정으로 늘려도 8회를 넘지 않음
    eq(G.checkGeminiBudget({ day: G.pacificDay(clock.now()), calls: 8 }, { now: clock.now(), maxPerDay: 200 }).ok, false);
    clock.advance(24 * 3600 * 1000);
    eq(G.checkGeminiBudget(state, { now: clock.now() }).ok, true, "다음 날");
  });

  await t("7.3-5 요청 간격 20초 이상 (분당 3회 이하 — AI Studio 5 RPM보다 낮음)", async () => {
    const clock = fakeClock();
    const state = {};
    const at = [];
    const f = async () => (at.push(clock.now()), okReply());
    for (let i = 0; i < 4; i++) await providers.generateArticle(cand, ev, gctx({ state, fetch: f, clock }));
    eq(at.length, 4);
    for (let i = 1; i < at.length; i++) ok(at[i] - at[i - 1] >= 20_000, `간격 ${at[i] - at[i - 1]}ms`);
    eq(clock.slept[0], 20_000, "두 번째 요청 전 대기");
  });

  await t("7.3-6 429·RESOURCE_EXHAUSTED: 재시도 없이 그날 Gemini 중단", async () => {
    for (const reply of [() => new Response("{}", { status: 429 }), () => new Response('{"error":{"status":"RESOURCE_EXHAUSTED"}}', { status: 403 })]) {
      const clock = fakeClock();
      const state = {};
      const f = counter(reply);
      const a = await providers.generateArticle(cand, ev, gctx({ state, fetch: f, clock }));
      const b = await providers.generateArticle(cand, ev, gctx({ state, fetch: f, clock }));
      eq([a.status, b.status, f.n, state.exhausted, state.calls], ["skipped", "skipped", 1, true, 1]);
      ok(/재시도·유료 전환 없이/.test(a.error) && /한도/.test(b.error), a.error);
    }
  });

  await t("7.3-7 동시 요청 1개 · 사용 기록 없으면 차단 · 실행끼리 같은 예산 (대기열 파일)", async () => {
    const clock = fakeClock();
    const state = {};
    let release;
    const gate = new Promise((r) => (release = r));
    const f = counter(async () => (await gate, okReply()));
    const p = [1, 2, 3].map(() => providers.generateArticle(cand, ev, gctx({ state, fetch: f, clock })));
    await new Promise((r) => setTimeout(r, 5));
    release();
    const r = await Promise.all(p);
    eq([f.n, r.filter((x) => x.status === "ok").length, state.calls], [1, 1, 1], "병렬 3건 → 요청 1건");
    ok(r.filter((x) => x.status === "skipped").every((x) => /진행 중/.test(x.error)), "나머지는 진행 중으로 건너뜀");
    const none = counter();
    const ctx = gctx({ fetch: none });
    ctx.geminiState = null;
    eq([(await providers.generateArticle(cand, ev, ctx)).status, none.n], ["skipped", 0], "기록 없음");
    // 실행 두 번이 같은 대기열 파일을 쓰면 사용량이 이어진다
    WEB.set("https://fx-gb.test/feed.xml", { body: rss(announcements("fx-gb", 6)), type: "application/rss+xml" });
    const env = ENV({ DAILY_MODE: "draft", DAILY_LLM_PROVIDER: "gemini", GEMINI_API_KEY: KEY, DAILY_GEMINI_FREE_TIER_CONFIRMED: "true", DAILY_GEMINI_BILLING_TIER: "free" });
    const o = base({ env, now: clock.now, sleep: clock.sleep, registry: { sources: [src("fx-gb", "https://fx-gb.test/feed.xml")] } });
    let calls1 = 0;
    await runDaily({ ...o, fetch: async () => (calls1++, new Response("{}", { status: 500 })) });
    eq(loadQueue(o.queueFile).gemini.calls, calls1, "기록된 사용량 = 실제 요청 수");
    ok(calls1 >= 1 && calls1 <= 6, `1차 실행 ${calls1}`);
    let calls2 = 0;
    await runDaily({ ...o, out: o.out + "-2", fetch: async () => (calls2++, new Response("{}", { status: 500 })) });
    ok(calls1 + calls2 <= 8, `두 실행 합계 ${calls1 + calls2} ≤ 8`);
    eq(loadQueue(o.queueFile).gemini.calls, calls1 + calls2);
  });

  await t("7.3-10 정기(none)·수동 free-draft 여러 번이 같은 기록을 쓰면 하루 8회를 넘지 않음 · 태평양 자정에 새로 셈", async () => {
    eq([G.pacificDay(Date.parse("2026-10-29T06:59:59Z")), G.pacificDay(Date.parse("2026-10-29T07:00:00Z"))], ["2026-10-28", "2026-10-29"], "PDT 자정");
    eq([G.pacificDay(Date.parse("2026-11-02T07:59:59Z")), G.pacificDay(Date.parse("2026-11-02T08:00:00Z"))], ["2026-11-01", "2026-11-02"], "PST 자정");
    WEB.set("https://fx-gr.test/feed.xml", { body: rss(announcements("fx-gr", 6)), type: "application/rss+xml" });
    const clock = fakeClock(Date.parse("2026-10-29T08:00:00Z"));
    const o = base({ now: clock.now, sleep: clock.sleep, registry: { sources: [src("fx-gr", "https://fx-gr.test/feed.xml")] } });
    const gem = ENV({ DAILY_MODE: "draft", DAILY_LLM_PROVIDER: "gemini", GEMINI_API_KEY: KEY, DAILY_GEMINI_FREE_TIER_CONFIRMED: "true", DAILY_GEMINI_BILLING_TIER: "free" });
    let n = 0;
    const f = async () => (n++, new Response("{}", { status: 500 })); // 실패해도 예산 차감
    // 정기 실행 (DAILY_FREE_DRAFT_ENABLED=false → workflow가 provider none, 키 없음)
    await runDaily({ ...o, out: o.out + "-s", env: ENV({ DAILY_MODE: "shadow", DAILY_LLM_PROVIDER: "none" }), fetch: f });
    eq(n, 0, "정기 실행 호출 0");
    for (let i = 0; i < 4; i++) {
      // 수동 실행마다 처리 기록을 지워 같은 후보를 다시 원고 대상으로 만든다 (최악의 경우)
      fs.rmSync(o.processedFile, { force: true });
      const q = loadQueue(o.queueFile);
      fs.writeFileSync(o.queueFile, JSON.stringify({ ...q, items: {} }));
      await runDaily({ ...o, out: `${o.out}-m${i}`, env: gem, fetch: f, existing: EMPTY() });
    }
    eq(n, 8, "수동 4번 합계");
    eq(loadQueue(o.queueFile).gemini.calls, 8);
    clock.advance(24 * 3600 * 1000);
    fs.rmSync(o.processedFile, { force: true });
    await runDaily({ ...o, out: `${o.out}-next`, env: gem, fetch: f, existing: EMPTY() });
    ok(n > 8 && n <= 14, `다음 날 새 예산 (${n - 8}회)`);
  });

  await t("7.3-11 GitHub Actions에서는 유료 Anthropic 호출 0 (키가 있어도)", async () => {
    const f = counter();
    const ctx = { ...gctx({ fetch: f }), provider: "anthropic", env: { ANTHROPIC_API_KEY: "sk-ant-test-not-real-000000", GITHUB_ACTIONS: "true" } };
    const r = await providers.generateArticle(cand, ev, ctx);
    eq([r.status, f.n], ["skipped", 0]);
    WEB.set("https://fx-ga.test/feed.xml", { body: rss(announcements("fx-ga", 2)), type: "application/rss+xml" });
    let n = 0;
    const run = await runDaily(base({ env: ENV({ DAILY_MODE: "draft", DAILY_LLM_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "sk-ant-test-not-real-000000", GITHUB_ACTIONS: "true" }), registry: { sources: [src("fx-ga", "https://fx-ga.test/feed.xml")] }, fetch: async () => (n++, new Response("{}")) }));
    eq(n, 0, "실행 전체 유료 호출 0");
    ok(!run.run.items.some((x) => x.generation?.provider === "anthropic" && x.generation?.status === "ok"), "유료 원고 없음");
  });

  await t("7.3-8 Gemini 원고는 자동 발행 불가 (사람이 실행한 manual만)", async () => {
    const doc = { drafts: [{ verdict: "PUBLISHABLE", story: { slug: "g-1" }, generation: { provider: "gemini" } }] };
    const r = pub.publishApproved({ doc, approvedBy: "auto-bot", mode: "auto", allowAuto: true, runId: "t", runStep: () => ({ ok: true, out: "" }), publicationsFile: path.join(tmp, `pub-${rid()}.json`) });
    eq([r.ok, r.stage], [false, "approval"]);
    ok(/자동 발행 불가/.test(r.problems[0]), r.problems[0]);
  });

  await t("7.3-9 API 키가 결과·오류·기록·로그에 남지 않음", async () => {
    const lines = [];
    const state = {};
    const boom = async () => {
      throw new Error(`fetch failed for key=${KEY}`);
    };
    const r = await providers.generateArticle(cand, ev, gctx({ state, fetch: boom }));
    ok(!JSON.stringify(r).includes(KEY) && /REDACTED/.test(r.error), r.error);
    ok(!providers.redact(`x AIzaSyAAAAAAAAAAAAAAAAAAAAAAAAAAAA y`).includes("AIzaSy"), "AIza 형식 가림");
    WEB.set("https://fx-gk.test/feed.xml", { body: rss(announcements("fx-gk", 1)), type: "application/rss+xml" });
    const env = ENV({ DAILY_MODE: "draft", DAILY_LLM_PROVIDER: "gemini", GEMINI_API_KEY: KEY, DAILY_GEMINI_FREE_TIER_CONFIRMED: "true", DAILY_GEMINI_BILLING_TIER: "free" });
    const o = base({ env, log: (...a) => lines.push(a.join(" ")), registry: { sources: [src("fx-gk", "https://fx-gk.test/feed.xml")] }, fetch: boom });
    const run = await runDaily(o);
    ok(!lines.join("\n").includes(KEY), "로그");
    ok(!fs.readFileSync(o.queueFile, "utf8").includes(KEY), "대기열 파일");
    ok(!JSON.stringify(run.run).includes(KEY), "보고서");
  });
}

// ---------- 원고 내보내기 · 발행 · 배포 ----------
await t("원고 내보내기: 초안 QA PASS가 아니면 PUBLISHABLE로 내보내지 않음 (자동 발행 대상 아님)", async () => {
  const { exportRun } = await import("./export-drafts.mjs");
  const d = path.join(tmp, rid());
  fs.mkdirSync(path.join(d, "drafts"), { recursive: true });
  fs.mkdirSync(path.join(d, "candidates"), { recursive: true });
  const rec = { candidateId: "aaaaaaaaaaaa", source: { name: "FX Co", url: "https://fx-x.test/news/a", title: "A", publishedAt: "2026-10-15T09:00:00Z", type: "official" }, evidenceSummary: { ledger: [{ id: "E1", text: "Alpha 2 is available starting October 15, 2026." }] }, draft: { title: "제목", summary: "요약", category: "PRODUCT_UPDATE", topics: ["ai-coding"], facts: [{ text: "10월 15일부터 쓸 수 있습니다.", evidence: ["E1"] }], why: { text: "왜", evidence: ["E1"] }, change: { text: "변화", evidence: ["E1"] }, editorialDepth: "SHORT" }, qa: { verdict: "REVIEW" }, approvable: true, generation: { provider: "gemini", model: "gemini-3.8-flash" }, duplicate: {} };
  fs.writeFileSync(path.join(d, "drafts", "aaaaaaaaaaaa.json"), JSON.stringify(rec));
  fs.writeFileSync(path.join(d, "candidates", "aaaaaaaaaaaa.json"), JSON.stringify({ decision: "PUBLISH", proposedSlug: "alpha-2", needsReview: [] }));
  const doc = exportRun(d, { existing: { ...EMPTY(), stories: [] } });
  eq([doc.drafts.length, doc.drafts[0].verdict, doc.drafts[0].story.slug], [1, "REVIEW", "alpha-2"]);
  ok(doc.drafts[0].reviewReasons.some((x) => /초안 QA REVIEW/.test(x)), "이유");
});

await t("J. Vercel 배포 실패: 기사 기록은 'deploy failed'로 남고 운영 확인은 하지 않음 · 기본은 배포 꺼짐 · 성공 후 URL 확인", async () => {
  const f = path.join(tmp, `pub-${rid()}.json`);
  pub.savePublications([{ slug: "alpha-2", url: "https://aimajung.com/stories/alpha-2/", deploy: { status: "pending" }, live: { status: "pending" } }], f);
  const off = pub.deployProduction({ env: {}, publicationsFile: f });
  ok(off.skipped && /VERCEL_DEPLOY_ENABLED/.test(off.reason), "기본 꺼짐");
  const failedDeploy = pub.deployProduction({ env: { VERCEL_DEPLOY_ENABLED: "true", VERCEL_TOKEN: "tok-secret-123" }, exec: () => ({ ok: false, out: "Error: build failed tok-secret-123" }), publicationsFile: f });
  eq(failedDeploy.ok, false);
  let rec = pub.loadPublications(f)[0];
  eq([rec.deploy.status, rec.deploy.attempts, rec.live.status], ["failed", 1, "pending"]);
  ok(!rec.deploy.error.includes("tok-secret-123"), "토큰 가림");
  const v0 = await pub.verifyLive({ publicationsFile: f, fetchImpl: async () => new Response("ok"), sleep: async () => {} });
  eq(v0.checked, 0, "배포 안 된 기사는 운영 확인 안 함");
  const okDeploy = pub.deployProduction({ env: { VERCEL_DEPLOY_ENABLED: "true", VERCEL_TOKEN: "tok" }, exec: () => ({ ok: true, out: "Production: https://ai-media-project-abc.vercel.app" }), publicationsFile: f });
  eq([okDeploy.ok, pub.loadPublications(f)[0].deploy.deployment], [true, "https://ai-media-project-abc.vercel.app"]);
  const v404 = await pub.verifyLive({ publicationsFile: f, tries: 2, fetchImpl: async () => new Response("nf", { status: 404 }), sleep: async () => {} });
  eq([v404.ok, pub.loadPublications(f)[0].live.status], [0, "failed"]);
  const v200 = await pub.verifyLive({ publicationsFile: f, fetchImpl: async () => new Response("ok", { status: 200 }), sleep: async () => {} });
  eq([v200.ok, pub.loadPublications(f)[0].live.status], [1, "ok"]);
});

await t("발행: 승인자 없으면 거부 · 자동 발행은 꺼져 있으면 거부 · publish:daily 실패면 ingest 되돌림 (격리 복사본)", async () => {
  const root = path.join(tmp, `root-${rid()}`);
  for (const d of ["content", "ingest/candidates", "ingest/editorial"]) fs.mkdirSync(path.join(root, d), { recursive: true });
  fs.cpSync(path.join(SITE, "content"), path.join(root, "content"), { recursive: true });
  fs.cpSync(path.join(SITE, "ingest/candidates"), path.join(root, "ingest/candidates"), { recursive: true });
  fs.cpSync(path.join(SITE, "ingest/editorial"), path.join(root, "ingest/editorial"), { recursive: true });
  const before = fs.readFileSync(path.join(root, "ingest/editorial/2026-10.json"), "utf8");
  const child = `
    const pub = await import(${JSON.stringify("file:///" + path.join(HERE, "publish.mjs").replace(/\\/g, "/"))});
    const story = { slug: "fx-pipeline-alpha-2", title: "Alpha 2 정식 출시… 무료 등급 하루 1,000건", status: "draft", publishedAt: null, eventDate: "2026-10-15", editorialDepth: "standard",
      summary: "FX Co가 10월 15일 Alpha 2를 모든 개발자에게 정식으로 내놨습니다. 하루 1,000건 무료 등급이 생겼고, 유료 등급은 월 20달러부터입니다.",
      facts: ["하루 1,000건까지 무료로 쓸 수 있는 등급이 새로 생겼습니다.", "유료 등급은 개발자 좌석당 월 20달러부터입니다.", "지원 언어는 40개입니다."],
      whyItMatters: "프리뷰로만 열려 있던 Alpha가 정식 출시되면서 개인 개발자도 비용 부담 없이 시험해 볼 수 있게 됐습니다. 다만 성능 수치는 회사 자체 측정입니다.",
      whatChanges: "기존 연동은 2027년 3월 31일까지 그대로 동작하므로 그 전에 옮기면 됩니다.",
      sourceUrl: "https://fx-x.test/news/alpha-2", sourceName: "FX Co", sourceTitle: "Introducing Alpha 2", sourceType: "official", sourcePublishedAt: "2026-10-15T09:00:00.000Z",
      contentType: "NEWS", category: "PRODUCT_UPDATE", topics: ["ai-coding"], companies: ["FX Co"], products: ["Alpha 2"], secondarySources: [], priority: 2 };
    const ev = [["하루 1,000건", "The new free tier includes 1,000 requests per day."], ["20달러", "Pricing starts at $20 per month per developer seat."], ["40개", "It supports 40 languages."]].map((x, i) => ({ fact: i + 1, url: story.sourceUrl, quote: x[1] }));
    ev.push({ fact: "change", url: story.sourceUrl, quote: "Existing integrations keep working until March 31, 2027 (October 15)." });
    const doc = { drafts: [{ verdict: "PUBLISHABLE", handsOn: false, relatedStory: null, story, evidence: ev }] };
    const out = {};
    out.noApprover = pub.publishApproved({ doc, approvedBy: "", runId: "t" });
    out.autoOff = pub.publishApproved({ doc, approvedBy: "editor", mode: "auto", runId: "t" });
    out.failed = pub.publishApproved({ doc, approvedBy: "editor", runId: "t", runStep: () => ({ ok: false, out: "qa:content FAIL" }), publicationsFile: ${JSON.stringify(path.join(root, "ingest/publications.json"))} });
    console.log(JSON.stringify({ noApprover: out.noApprover.stage, autoOff: out.autoOff.stage, failed: out.failed.stage }));
  `;
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", child], { encoding: "utf8", env: { ...process.env, AIMAJUNG_ROOT: root, AUTO_PUBLISH_ENABLED: "" } });
  const res = JSON.parse(r.stdout.trim().split("\n").at(-1) || "{}");
  eq(res, { noApprover: "approval", autoOff: "approval", failed: "publish:daily" }, r.stderr.slice(-400));
  eq(fs.readFileSync(path.join(root, "ingest/editorial/2026-10.json"), "utf8"), before, "실패 시 편집 항목 되돌림");
  ok(!fs.existsSync(path.join(root, "ingest/publications.json")), "실패한 발행은 기록하지 않음");
});

await t("발행 workflow: 보호된 Environment · master에서만 · 배포는 두 스위치(입력 deploy + VERCEL_DEPLOY_ENABLED) · 자동 발행은 기본 꺼짐", async () => {
  const wf = fs.readFileSync(path.join(REPO, ".github/workflows/publish.yml"), "utf8");
  ok(/environment: production-publish/.test(wf), "Environment");
  ok(wf.indexOf("npx next typegen") > 0 && wf.indexOf("npx next typegen") < wf.indexOf("Publish (content)"), "발행 전 Next 타입 생성 (새 runner에서 tsc 실패 방지)");
  ok(/github\.ref_name == github\.event\.repository\.default_branch/.test(wf), "master만");
  ok(/if: inputs\.deploy && vars\.VERCEL_DEPLOY_ENABLED == 'true'/.test(wf), "배포 스위치 두 개");
  ok(!/schedule:/.test(wf), "예약 실행 없음");
  ok(!/--force|-f\b.*push/.test(wf), "force push 없음");
  ok(/--approved-by "\$\{\{ github\.actor \}\}"/.test(wf), "승인자 기록");
  const daily = fs.readFileSync(path.join(REPO, ".github/workflows/daily-editorial.yml"), "utf8");
  ok(/vars\.AUTO_PUBLISH_ENABLED == 'true'/.test(daily) && /vars\.AUTO_DEPLOY_ENABLED == 'true'/.test(daily), "자동 발행·배포 변수");
});

await t("실제 기사·뉴스레터 데이터 변경 없음", async () => {
  const d = spawnSync("git", ["status", "--porcelain", "--", "content", "newsletter", "ingest/candidates", "ingest/editorial", "ingest/newsletter-sent.json", "ingest/publications.json"], { cwd: SITE, encoding: "utf8" });
  eq(d.stdout.trim(), "");
});

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${failed ? "FAIL" : "OK"} — 파이프라인 점검 ${passed}/${passed + failed} 통과`);
if (failed) process.exitCode = 1;
