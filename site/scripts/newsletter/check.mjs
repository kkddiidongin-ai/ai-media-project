#!/usr/bin/env node
/**
 * 뉴스레터 점검 (외부 호출 없음): npm run qa:newsletter
 *
 * 1) 구독 처리(src/lib/newsletterSubscribe.ts)를 가짜 저장소로 시험한다
 *    정상 · 잘못된 이메일 · 동의 없음 · 중복 · 해지 후 재구독 · 허니팟 · 저장소 실패 · 설정 없음 · 요청 제한 · 다른 출처
 * 2) 메일 렌더링을 대표 사례로 시험한다
 *    섹션 표시/숨김, 수신거부 링크, 미치환 값(undefined 등), JavaScript 없음, 이메일 주소 노출 없음
 * 3) 정적 산출물(out/)에 비밀값·구독자 정보가 들어가지 않았는지 본다 (빌드 후에만)
 */
import fs from "node:fs";
import path from "node:path";
import { createJiti } from "jiti";
import { ROOT, composeIssue, loadConfig, loadIssues, loadStories, renderIssueEmail, sendSettings } from "./lib.mjs";

const jiti = createJiti(import.meta.url);
const sub = await jiti.import(path.join(ROOT, "src/lib/newsletterSubscribe.ts"));
const config = await loadConfig();

let failed = 0;
let passed = 0;
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

// ---------- 1) 구독 처리 ----------

function fakeStore(existing = {}) {
  const db = new Map(Object.entries(existing));
  const calls = [];
  return {
    db,
    calls,
    async find(email) {
      calls.push(["find", email]);
      const c = db.get(email);
      return c ? { exists: true, unsubscribed: c.unsubscribed, inSegment: c.inSegment } : { exists: false, unsubscribed: false, inSegment: false };
    },
    async create(email, interests) {
      calls.push(["create", email, interests]);
      db.set(email, { unsubscribed: false, inSegment: true, interests });
    },
    async resubscribe(email, interests) {
      calls.push(["resubscribe", email, interests]);
      db.set(email, { unsubscribed: false, inSegment: true, interests });
    },
  };
}
const always = () => true;
const logs = [];
const log = (e) => logs.push(JSON.stringify(e));
const req = (body, extra = {}) => ({ body, ip: "1.2.3.4", origin: "https://ai.example", host: "ai.example", ...extra });
const valid = { email: "  Reader@Example.com ", interests: ["claude", "ai-coding", "bogus"], consent: true, website: "" };

await t("정상 구독 → 200 subscribed, 소문자 정규화, 모르는 관심 분야 제거", async () => {
  const s = fakeStore();
  const r = await sub.handleSubscribe(req(valid), s, always, log);
  eq(r, { status: 200, body: { ok: true, code: "subscribed" } });
  eq(s.calls.at(-1), ["create", "reader@example.com", ["claude", "ai-coding"]]);
});
await t("잘못된 이메일 → 400 invalid_email, 저장소 호출 없음", async () => {
  for (const email of ["", "abc", "a@b", "a@@b.com", "a b@c.com", "x".repeat(250) + "@a.com", 123, null]) {
    const s = fakeStore();
    const r = await sub.handleSubscribe(req({ ...valid, email }), s, always, log);
    eq(r.body.code, "invalid_email", String(email).slice(0, 20));
    eq(s.calls.length, 0);
  }
});
await t("동의 없음 → 400 consent_required", async () => {
  for (const consent of [false, undefined, "true", "yes"]) {
    const r = await sub.handleSubscribe(req({ ...valid, consent }), fakeStore(), always, log);
    eq(r, { status: 400, body: { ok: false, code: "consent_required" } });
  }
});
await t("이미 구독 중 → 409 duplicate, 새로 만들지 않음", async () => {
  const s = fakeStore({ "reader@example.com": { unsubscribed: false, inSegment: true } });
  const r = await sub.handleSubscribe(req(valid), s, always, log);
  eq(r, { status: 409, body: { ok: false, code: "duplicate" } });
  ok(!s.calls.some((c) => c[0] !== "find"), "find 외 호출이 있음");
});
await t("해지했던 주소 → 재구독 200", async () => {
  const s = fakeStore({ "reader@example.com": { unsubscribed: true, inSegment: true } });
  const r = await sub.handleSubscribe(req(valid), s, always, log);
  eq(r.body.code, "subscribed");
  eq(s.calls.at(-1)[0], "resubscribe");
});
await t("연락처는 있지만 구독 Segment에 없음 → 재구독 처리", async () => {
  const s = fakeStore({ "reader@example.com": { unsubscribed: false, inSegment: false } });
  eq((await sub.handleSubscribe(req(valid), s, always, log)).body.code, "subscribed");
  eq(s.calls.at(-1)[0], "resubscribe");
});
await t("허니팟 → 200이지만 저장하지 않음", async () => {
  const s = fakeStore();
  const r = await sub.handleSubscribe(req({ ...valid, website: "http://spam" }), s, always, log);
  eq(r.status, 200);
  eq(s.calls.length, 0);
});
await t("저장소(API) 실패 → 502 error, 내부 정보 없음", async () => {
  const s = fakeStore();
  s.find = async () => {
    throw new sub.StoreError("invalid_api_key");
  };
  const r = await sub.handleSubscribe(req(valid), s, always, log);
  eq(r, { status: 502, body: { ok: false, code: "error" } });
  ok(!JSON.stringify(r).match(/resend|api_key|invalid/i), "응답에 내부 정보");
});
await t("예상 못 한 예외도 502 error", async () => {
  const s = fakeStore();
  s.create = async () => {
    throw new Error("socket hang up reader@example.com");
  };
  eq((await sub.handleSubscribe(req(valid), s, always, log)).body.code, "error");
});
await t("API 키·Segment 미설정 → 503 unavailable (가짜 성공 없음)", async () => {
  eq(await sub.handleSubscribe(req(valid), null, always, log), { status: 503, body: { ok: false, code: "unavailable" } });
  eq(sub.resendSettings({}), null);
  eq(sub.resendSettings({ RESEND_API_KEY: "k" }), null);
  eq(sub.resendSettings({ RESEND_API_KEY: "k", RESEND_AUDIENCE_ID: "seg" }), { apiKey: "k", segmentId: "seg" });
});
await t("요청 제한: 같은 IP 6번째부터 429", async () => {
  const allow = sub.createRateLimiter(5, 60_000);
  const codes = [];
  for (let i = 0; i < 7; i++) codes.push((await sub.handleSubscribe(req({ ...valid, email: `r${i}@example.com` }), fakeStore(), allow, log)).status);
  eq(codes, [200, 200, 200, 200, 200, 429, 429]);
  ok(allow("5.6.7.8"), "다른 IP는 허용");
  const later = sub.createRateLimiter(1, 1000);
  ok(later("x", 0) && !later("x", 10) && later("x", 2000), "시간이 지나면 풀림");
});
await t("다른 사이트 Origin → 403", async () => {
  eq((await sub.handleSubscribe(req(valid, { origin: "https://evil.example" }), fakeStore(), always, log)).status, 403);
  eq((await sub.handleSubscribe(req(valid, { origin: "null" }), fakeStore(), always, log)).status, 403);
  eq((await sub.handleSubscribe(req(valid, { origin: null }), fakeStore(), always, log)).status, 200);
});
await t("잘못된 본문 → 400 bad_request", async () => {
  for (const body of [null, "x", [], 5]) eq((await sub.handleSubscribe(req(body), fakeStore(), always, log)).body.code, "bad_request");
  eq((await sub.handleSubscribe(req({ ...valid, interests: Array(20).fill("claude") }), fakeStore(), always, log)).body.code, "bad_request");
});
await t("로그에 이메일 전체가 남지 않음", async () => {
  ok(logs.length > 0, "로그 없음");
  ok(!logs.some((l) => /@/.test(l)), `로그에 이메일: ${logs.find((l) => /@/.test(l))}`);
});

// ---------- 2) 메일 렌더링 ----------

const stories = loadStories();
const issues = loadIssues(stories);
const render = (issue, mode = "preview") => renderIssueEmail(issue, { mode, allStories: stories, config });
const sectionIn = (html, label) => html.includes(label);

await t("모든 호가 렌더링되고 미치환 값·스크립트가 없음", async () => {
  for (const i of issues) {
    const { html, text, subject, preheader } = render(i);
    ok(!/undefined|null|NaN|\[object Object\]/.test(html + text + subject + preheader), `${i.date} 미치환 값`);
    ok(!/<script|javascript:|onclick=/i.test(html), `${i.date} 스크립트`);
    ok(/<table[^>]+width="640"/.test(html), `${i.date} 640px 컨테이너`);
    ok(html.includes(`/newsletters/${i.date}/`), `${i.date} 웹에서 보기`);
    ok(sectionIn(html, "🔥 오늘의 메인") && sectionIn(html, "📌 AI마중 POINT"), `${i.date} 필수 섹션`);
    ok(!/[\w.+-]+@[\w-]+\.[\w.]+/.test(html.replace(/xmlns="[^"]+"/, "")), `${i.date} 이메일 주소 노출`);
  }
});
await t("수신거부: 발송은 Resend 링크, 미리보기·테스트는 안내 페이지", async () => {
  const i = issues[0];
  ok(render(i, "broadcast").html.includes("{{{RESEND_UNSUBSCRIBE_URL}}}"), "broadcast");
  ok(render(i, "broadcast").text.includes("{{{RESEND_UNSUBSCRIBE_URL}}}"), "broadcast text");
  ok(render(i, "test").html.includes("/newsletter/unsubscribe/"), "test");
});
await t("1건뿐인 호: 오늘의 AI·놓치면 아쉬운 변화 숨김", async () => {
  const i = issues.find((x) => x.stories.length === 1);
  const { html } = render(i);
  ok(!sectionIn(html, "☀️ 오늘의 AI") && !sectionIn(html, "⚡ 놓치면 아쉬운 변화"), "숨겨지지 않음");
});
await t("여러 건 호: 오늘의 AI 최대 5건, 놓치면 아쉬운 변화 최대 8건 + 더 보기", async () => {
  const big = [...issues].sort((a, b) => b.stories.length - a.stories.length)[0];
  const p = composeIssue(big, stories);
  eq(p.today.length, Math.min(5, big.stories.length));
  ok(p.more.length <= 8, "8건 초과");
  if (big.stories.length - 1 > 8) ok(render(big).html.includes("더 보기"), "더 보기 없음");
});
await t("확인 콘텐츠 없는 날: 🧪 섹션 숨김", async () => {
  const i = issues.find((x) => composeIssue(x, stories).checked.length === 0);
  ok(!sectionIn(render(i).html, "🧪"), "숨겨지지 않음");
});
await t("관련 기사 없는 호: 📚 섹션 숨김", async () => {
  const i = issues.find((x) => composeIssue(x, stories).related.length === 0);
  if (i) ok(!sectionIn(render(i).html, "📚 더 읽어보기"), "숨겨지지 않음");
});
await t("심층 메인: lead와 point 섹션을 씀", async () => {
  const i = issues.find((x) => x.stories[0].editorialDepth === "deep");
  const m = i.stories[0];
  const html = render(i).html;
  const pt = m.sections.find((s) => s.role === "point")?.paragraphs?.[0];
  ok(html.includes(m.lead.slice(0, 20).replace(/&/g, "&amp;").replace(/</g, "&lt;")), "lead 없음");
  if (pt) ok(composeIssue(i, stories).point === pt, "point 섹션 아님");
});
await t("HTML 특수문자 이스케이프", async () => {
  const fake = { date: "2026-01-02", stories: [{ ...issues.at(-1).stories[0], title: `<b>"A&B"</b>`, summary: "x<y" }] };
  const { html } = render(fake);
  ok(html.includes("&lt;b&gt;&quot;A&amp;B&quot;&lt;/b&gt;") && !html.includes("<b>\"A&B"), "이스케이프 안 됨");
});
await t("발송 설정: 빠진 값·vercel.app 발신 주소를 막음", async () => {
  const nc = config.newsletterConfig;
  ok(sendSettings({}, nc).problems.length >= 3, "빈 설정 통과");
  ok(sendSettings({ RESEND_API_KEY: "k", RESEND_AUDIENCE_ID: "s", NEWSLETTER_FROM_EMAIL: "news@ai-media-project-eight.vercel.app" }, nc).problems.some((p) => p.includes("vercel.app")), "vercel.app 통과");
  eq(sendSettings({ RESEND_API_KEY: "k", RESEND_AUDIENCE_ID: "s", NEWSLETTER_FROM_EMAIL: "news@example.org" }, nc).problems, []);
  eq(sendSettings({ RESEND_API_KEY: "k", RESEND_AUDIENCE_ID: "s", NEWSLETTER_FROM_EMAIL: "news@example.org" }, nc).from, "AI마중 <news@example.org>");
});

// ---------- 3) 정적 산출물·저장소 ----------

await t("정적 산출물·저장소에 비밀값이 없음", async () => {
  const roots = [path.join(ROOT, "out"), path.join(ROOT, "src"), path.join(ROOT, "api"), path.join(ROOT, "scripts")].filter((p) => fs.existsSync(p));
  const bad = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(html|js|txt|json|ts|tsx|mjs)$/.test(e.name)) {
        const s = fs.readFileSync(p, "utf8");
        if (/re_[A-Za-z0-9]{8,}_[A-Za-z0-9]{8,}/.test(s)) bad.push(path.relative(ROOT, p));
        if (p.includes(`${path.sep}out${path.sep}`) && /RESEND_API_KEY|RESEND_AUDIENCE_ID/.test(s)) bad.push(path.relative(ROOT, p));
      }
    }
  };
  roots.forEach(walk);
  eq(bad, []);
});

console.log(`${failed ? "FAIL" : "OK"} — 뉴스레터 점검 ${passed}/${passed + failed} 통과`);
process.exit(failed ? 1 : 0);
