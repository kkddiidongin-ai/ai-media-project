#!/usr/bin/env node
/**
 * 뉴스레터 점검 (외부 호출 없음): npm run qa:newsletter
 *
 * 1) 구독 신청·확인(이중 확인, src/lib/newsletterSubscribe.ts)을 가짜 발송기·저장소로 시험한다
 *    신청 시 연락처 미생성 · 토큰 위변조/만료/재사용 · 재신청 · 해지 후 재구독 · 허니팟 · 요청 제한 · 다른 출처 · 실패 · 설정 없음
 *    + 실제 Resend SDK에 가짜 fetch를 물려 요청 URL에 이메일이 들어가지 않는지 확인한다
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

// ---------- 1) 구독 신청 · 확인 (이중 확인) ----------

const tok = await jiti.import(path.join(ROOT, "src/lib/newsletterToken.ts"));
const confirmMail = await jiti.import(path.join(ROOT, "src/lib/newsletterConfirmEmail.ts"));
const SECRET = "test-secret-".padEnd(48, "x");
const OTHER_SECRET = "other-secret-".padEnd(48, "y");

/** 가짜 확인 메일 발송기: 보낸 링크를 모은다 */
function fakeMailer() {
  const sent = [];
  return {
    sent,
    async sendConfirmation(email, url) {
      sent.push({ email, url });
    },
  };
}
/** 가짜 Resend 연락처 저장소 (확인 단계 전용) */
function fakeStore(existing = {}) {
  const db = new Map(Object.entries(existing));
  const calls = [];
  return {
    db,
    calls,
    async confirm(email, interests) {
      calls.push(["confirm", email, interests]);
      const c = db.get(email);
      const wasActive = c && !c.unsubscribed && c.inSegment;
      db.set(email, { unsubscribed: false, inSegment: true, interests });
      return wasActive ? "already" : "subscribed";
    },
  };
}
const always = () => true;
const logs = [];
const log = (e) => logs.push(JSON.stringify(e));
const req = (body, extra = {}) => ({ body, ip: "1.2.3.4", origin: "https://ai.example", host: "ai.example", ...extra });
const valid = { email: "  Reader@Example.com ", interests: ["claude", "ai-coding", "bogus"], consent: true, website: "" };
const subCtx = (mailer, extra = {}) => ({ mailer, secret: SECRET, allowIp: always, allowEmail: always, log, ...extra });
const confCtx = (store, extra = {}) => ({ store, secret: SECRET, allowIp: always, log, ...extra });
const tokenOf = (url) => new URL(url).hash.replace(/^#token=/, "");

await t("신청 → 200 confirmation_sent, 확인 메일 1통, 연락처는 아직 만들지 않음", async () => {
  const m = fakeMailer();
  const s = fakeStore();
  const r = await sub.handleSubscribe(req(valid), subCtx(m));
  eq(r, { status: 200, body: { ok: true, code: "confirmation_sent" } });
  eq(m.sent.length, 1);
  eq(m.sent[0].email, "reader@example.com");
  eq(s.calls.length, 0, "신청 단계 저장소 호출");
});
await t("확인 링크: https://aimajung.com/newsletter/confirm/#token=…, 이메일·query 없음", async () => {
  const m = fakeMailer();
  await sub.handleSubscribe(req(valid), subCtx(m));
  const u = new URL(m.sent[0].url);
  eq(u.origin + u.pathname, "https://aimajung.com/newsletter/confirm/");
  eq(u.search, "");
  ok(!/@|%40|reader|example/i.test(m.sent[0].url), "링크에 이메일 흔적");
});
await t("토큰은 암호화: 풀어 봐도 이메일·관심 분야가 보이지 않음", async () => {
  const m = fakeMailer();
  await sub.handleSubscribe(req(valid), subCtx(m));
  const raw = Buffer.from(tokenOf(m.sent[0].url), "base64url").toString("latin1");
  ok(!/reader|example|claude|ai-coding/i.test(raw), "토큰 안에 평문");
});
await t("확인: 정상 토큰 → confirmed, 구독·Segment·interests 저장", async () => {
  const m = fakeMailer();
  const s = fakeStore();
  await sub.handleSubscribe(req(valid), subCtx(m));
  const r = await sub.handleConfirm(req({ token: tokenOf(m.sent[0].url) }), confCtx(s));
  eq(r, { status: 200, body: { ok: true, code: "confirmed" } });
  eq(s.db.get("reader@example.com"), { unsubscribed: false, inSegment: true, interests: ["claude", "ai-coding"] });
});
await t("같은 토큰 재사용 → already_confirmed, 연락처 1개 그대로 (멱등)", async () => {
  const m = fakeMailer();
  const s = fakeStore();
  await sub.handleSubscribe(req(valid), subCtx(m));
  const token = tokenOf(m.sent[0].url);
  await sub.handleConfirm(req({ token }), confCtx(s));
  const again = await sub.handleConfirm(req({ token }), confCtx(s));
  const third = await sub.handleConfirm(req({ token }), confCtx(s));
  eq([again.body.code, third.body.code], ["already_confirmed", "already_confirmed"]);
  eq(s.db.size, 1);
});
await t("위변조 토큰 → 400 invalid, 저장소 호출 없음", async () => {
  const m = fakeMailer();
  const s = fakeStore();
  await sub.handleSubscribe(req(valid), subCtx(m));
  const token = tokenOf(m.sent[0].url);
  const flip = (str, i) => str.slice(0, i) + (str[i] === "A" ? "B" : "A") + str.slice(i + 1);
  for (const bad of [flip(token, 5), flip(token, 30), flip(token, token.length - 3), token.slice(0, -4), token + "AA"]) {
    eq((await sub.handleConfirm(req({ token: bad }), confCtx(s))).body.code, "invalid");
  }
  eq(s.calls.length, 0);
});
await t("다른 비밀값으로 만든 토큰·임의 문자열 → invalid", async () => {
  const s = fakeStore();
  const forged = tok.sealToken({ email: "victim@example.com", interests: [], expiresAt: Date.now() + 3600_000 }, OTHER_SECRET);
  for (const token of [forged, "", "abc", "x".repeat(300), null, 42, { a: 1 }, "AQ" + "A".repeat(60)]) {
    eq((await sub.handleConfirm(req({ token }), confCtx(s))).body.code, "invalid", String(token).slice(0, 10));
  }
  eq(s.calls.length, 0);
});
await t("만료 토큰 → 410 expired (24시간 + 1분 뒤)", async () => {
  const m = fakeMailer();
  const s = fakeStore();
  const t0 = Date.parse("2026-10-07T00:00:00Z");
  await sub.handleSubscribe(req(valid), subCtx(m, { now: t0 }));
  const token = tokenOf(m.sent[0].url);
  eq((await sub.handleConfirm(req({ token }), confCtx(s, { now: t0 + 23 * 3600_000 }))).body.code, "confirmed");
  eq(await sub.handleConfirm(req({ token }), confCtx(fakeStore(), { now: t0 + 24 * 3600_000 + 60_000 })), { status: 410, body: { ok: false, code: "expired" } });
});
await t("같은 주소 재신청 · 이미 구독 중인 주소 신청 → 새 주소와 똑같은 응답 (상태 노출 없음)", async () => {
  const fresh = await sub.handleSubscribe(req({ ...valid, email: "new@example.com" }), subCtx(fakeMailer()));
  const m = fakeMailer();
  const again1 = await sub.handleSubscribe(req(valid), subCtx(m));
  const again2 = await sub.handleSubscribe(req(valid), subCtx(m));
  eq([again1, again2], [fresh, fresh]);
  eq(m.sent.length, 2, "확인 메일은 다시 보냄");
});
await t("같은 주소로 너무 자주 신청 → 메일은 더 안 보내지만 응답은 같음", async () => {
  const allowEmail = sub.createRateLimiter(3, 3600_000);
  const m = fakeMailer();
  const codes = [];
  for (let i = 0; i < 5; i++) codes.push((await sub.handleSubscribe(req(valid), subCtx(m, { allowEmail }))).body.code);
  eq(codes, Array(5).fill("confirmation_sent"));
  eq(m.sent.length, 3);
});
await t("구독 해지했던 주소 → 확인 후 재구독", async () => {
  const s = fakeStore({ "reader@example.com": { unsubscribed: true, inSegment: true, interests: [] } });
  const m = fakeMailer();
  await sub.handleSubscribe(req(valid), subCtx(m));
  eq((await sub.handleConfirm(req({ token: tokenOf(m.sent[0].url) }), confCtx(s))).body.code, "confirmed");
  eq(s.db.get("reader@example.com").unsubscribed, false);
});
await t("잘못된 이메일 → 400 invalid_email, 메일 안 보냄", async () => {
  for (const email of ["", "abc", "a@b", "a@@b.com", "a b@c.com", "x".repeat(250) + "@a.com", 123, null]) {
    const m = fakeMailer();
    eq((await sub.handleSubscribe(req({ ...valid, email }), subCtx(m))).body.code, "invalid_email", String(email).slice(0, 20));
    eq(m.sent.length, 0);
  }
});
await t("동의 없음 → 400 consent_required", async () => {
  for (const consent of [false, undefined, "true", "yes"]) {
    eq(await sub.handleSubscribe(req({ ...valid, consent }), subCtx(fakeMailer())), { status: 400, body: { ok: false, code: "consent_required" } });
  }
});
await t("허니팟 → 정상과 같은 응답, 메일 안 보냄", async () => {
  const m = fakeMailer();
  eq((await sub.handleSubscribe(req({ ...valid, website: "http://spam" }), subCtx(m))).status, 200);
  eq(m.sent.length, 0);
});
await t("메일 발송(Resend) 실패 → 502 error, 내부 정보 없음", async () => {
  const m = {
    async sendConfirmation() {
      throw new sub.StoreError("invalid_api_key");
    },
  };
  const r = await sub.handleSubscribe(req(valid), subCtx(m));
  eq(r, { status: 502, body: { ok: false, code: "error" } });
  ok(!JSON.stringify(r).match(/resend|api_key|invalid/i), "응답에 내부 정보");
});
await t("확인 단계 Resend 실패·예외 → 502 error", async () => {
  const m = fakeMailer();
  await sub.handleSubscribe(req(valid), subCtx(m));
  const token = tokenOf(m.sent[0].url);
  for (const err of [new sub.StoreError("validation_error"), new Error("socket hang up reader@example.com")]) {
    const s = {
      async confirm() {
        throw err;
      },
    };
    eq(await sub.handleConfirm(req({ token }), confCtx(s)), { status: 502, body: { ok: false, code: "error" } });
  }
});
await t("설정 없음 → 503 unavailable (가짜 성공 없음)", async () => {
  eq((await sub.handleSubscribe(req(valid), subCtx(null))).status, 503);
  eq((await sub.handleSubscribe(req(valid), subCtx(fakeMailer(), { secret: null }))).status, 503);
  eq((await sub.handleConfirm(req({ token: "x" }), confCtx(null))).status, 503);
  eq((await sub.handleConfirm(req({ token: "x" }), confCtx(fakeStore(), { secret: null }))).status, 503);
  const full = { RESEND_API_KEY: "k", RESEND_AUDIENCE_ID: "seg", NEWSLETTER_CONFIRM_SECRET: SECRET };
  eq(sub.newsletterSettings({}), null);
  eq(sub.newsletterSettings({ ...full, NEWSLETTER_CONFIRM_SECRET: undefined }), null);
  eq(sub.newsletterSettings({ ...full, NEWSLETTER_CONFIRM_SECRET: "short" }), null, "짧은 비밀값");
  eq(sub.newsletterSettings({ ...full, RESEND_AUDIENCE_ID: "" }), null);
  eq(sub.newsletterSettings({ ...full, NEWSLETTER_FROM_EMAIL: "x@foo.vercel.app" }), null);
  eq(sub.newsletterSettings(full), { apiKey: "k", segmentId: "seg", secret: SECRET, from: "AI마중 <letter@aimajung.com>", replyTo: undefined });
  eq(sub.newsletterSettings({ ...full, NEWSLETTER_REPLY_TO: "hello@aimajung.com" }).replyTo, "hello@aimajung.com");
});
await t("요청 제한: 신청은 IP당 6번째부터 429, 확인은 넉넉하게", async () => {
  const allowIp = sub.createRateLimiter(5, 60_000);
  const codes = [];
  for (let i = 0; i < 7; i++) codes.push((await sub.handleSubscribe(req({ ...valid, email: `r${i}@example.com` }), subCtx(fakeMailer(), { allowIp }))).status);
  eq(codes, [200, 200, 200, 200, 200, 429, 429]);
  const confirmLimit = sub.createRateLimiter(30, 600_000);
  let allowed = 0;
  for (let i = 0; i < 30; i++) if (confirmLimit("ip")) allowed++;
  eq(allowed, 30);
  eq((await sub.handleConfirm(req({ token: "x" }), confCtx(fakeStore(), { allowIp: () => false }))).status, 429);
});
await t("다른 사이트 Origin → 403 (신청·확인)", async () => {
  for (const origin of ["https://evil.example", "null"]) {
    eq((await sub.handleSubscribe(req(valid, { origin }), subCtx(fakeMailer()))).status, 403);
    eq((await sub.handleConfirm(req({ token: "x" }, { origin }), confCtx(fakeStore()))).status, 403);
  }
  eq((await sub.handleSubscribe(req(valid, { origin: null }), subCtx(fakeMailer()))).status, 200);
});
await t("잘못된 본문 → 400 bad_request", async () => {
  for (const body of [null, "x", [], 5]) {
    eq((await sub.handleSubscribe(req(body), subCtx(fakeMailer()))).body.code, "bad_request");
    eq((await sub.handleConfirm(req(body), confCtx(fakeStore()))).body.code, "bad_request");
  }
  eq((await sub.handleSubscribe(req({ ...valid, interests: Array(20).fill("claude") }), subCtx(fakeMailer()))).body.code, "bad_request");
});
await t("확인 메일: 버튼·만료 안내·텍스트 버전, 스크립트 없음, 폭 560", async () => {
  const url = "https://aimajung.com/newsletter/confirm/#token=AbC_-123";
  const mail = confirmMail.renderConfirmEmail(url, 24);
  eq(mail.subject, "AI마중 뉴스레터 구독을 확인해 주세요");
  for (const s of ["AI마중 뉴스레터 구독을 신청하셨습니다.", "뉴스레터 구독 확인", "본인이 신청하지 않았다면", "24시간", `href="${url}"`, "https://aimajung.com/"]) ok(mail.html.includes(s), `HTML에 '${s}' 없음`);
  for (const s of ["뉴스레터 구독 확인: " + url, "본인이 신청하지 않았다면", "24시간", "https://aimajung.com/"]) ok(mail.text.includes(s), `텍스트에 '${s}' 없음`);
  ok(!/<script|javascript:|onclick=|<img/i.test(mail.html), "스크립트·이미지");
  ok(/width="560"/.test(mail.html) && /max-width: 560px/.test(mail.html), "모바일 폭 규칙");
  ok(confirmMail.renderConfirmEmail('x"><b>', 24).html.includes("x&quot;&gt;&lt;b&gt;"), "이스케이프");
});

// ---------- 1-2) 실제 Resend SDK로 요청 URL 검사 (fetch를 가로채 외부 호출 없음) ----------

process.env.NODE_ENV = "production"; // SDK 개발용 오류 로그(요청 경로 출력) 끄기 — Vercel Function과 같은 조건
const { Resend } = await import("resend");
const SEG = "seg_general";

/** Resend API 흉내. mode "conflict": 있는 주소 생성 시 오류 / "upsert": 있는 주소 생성 시 기존 id를 그대로 돌려줌 */
function fakeResendApi({ mode = "conflict", contacts = [], throttleOnce = false } = {}) {
  const db = contacts.map((c, i) => ({ id: c.id ?? `ct_${i}`, created_at: c.created_at ?? "2026-01-01T00:00:00Z", unsubscribed: false, segments: [SEG], properties: {}, ...c }));
  const urls = [];
  const emails = [];
  let throttled = !throttleOnce;
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const fetchImpl = async (input, init = {}) => {
    const u = new URL(String(input));
    const method = init.method ?? "GET";
    urls.push(`${method} ${u.pathname}${u.search}`);
    if (!throttled) {
      throttled = true;
      return json(429, { name: "rate_limit_exceeded", message: "Too many requests", statusCode: 429 });
    }
    const body = init.body ? JSON.parse(init.body) : null;
    const p = u.pathname;
    let m;
    if (method === "POST" && p === "/emails") {
      emails.push(body);
      return json(200, { id: "em_1" });
    }
    if (method === "POST" && p === "/contacts") {
      if (body.properties && Object.keys(body.properties).some((k) => k !== "interests")) return json(422, { name: "validation_error", message: "unknown property", statusCode: 422 });
      const ex = db.find((c) => c.email === body.email);
      if (ex && mode === "conflict") return json(422, { name: "validation_error", message: `Contact ${body.email} already exists`, statusCode: 422 });
      if (ex) return json(200, { object: "contact", id: ex.id });
      const c = { id: `ct_new${db.length}`, email: body.email, created_at: new Date().toISOString(), unsubscribed: body.unsubscribed, properties: body.properties, segments: (body.segments ?? []).map((s) => s.id) };
      db.push(c);
      return json(201, { object: "contact", id: c.id });
    }
    if (method === "GET" && p === "/contacts") {
      const limit = Number(u.searchParams.get("limit") ?? 20);
      const after = u.searchParams.get("after");
      const start = after ? db.findIndex((c) => c.id === after) + 1 : 0;
      const page = db.slice(start, start + limit);
      return json(200, { object: "list", has_more: start + limit < db.length, data: page.map(({ id, email, created_at, unsubscribed }) => ({ id, email, created_at, unsubscribed, first_name: null, last_name: null })) });
    }
    if ((m = p.match(/^\/contacts\/([^/]+)\/segments$/)) && method === "GET") {
      const c = db.find((x) => x.id === m[1]);
      return c ? json(200, { object: "list", has_more: false, data: c.segments.map((id) => ({ id, name: "General", created_at: "" })) }) : json(404, { name: "not_found", message: "nf", statusCode: 404 });
    }
    if ((m = p.match(/^\/contacts\/([^/]+)\/segments\/([^/]+)$/)) && method === "POST") {
      const c = db.find((x) => x.id === m[1]);
      if (!c.segments.includes(m[2])) c.segments.push(m[2]);
      return json(200, { id: m[2] });
    }
    if ((m = p.match(/^\/contacts\/([^/]+)$/))) {
      const c = db.find((x) => x.id === m[1]);
      if (!c) return json(404, { name: "not_found", message: "nf", statusCode: 404 });
      if (method === "GET") return json(200, { object: "contact", id: c.id, email: c.email, created_at: c.created_at, unsubscribed: c.unsubscribed, first_name: null, last_name: null, properties: {} });
      if (method === "PATCH") {
        if (body.unsubscribed !== undefined) c.unsubscribed = body.unsubscribed;
        if (body.properties) c.properties = body.properties;
        return json(200, { object: "contact", id: c.id });
      }
    }
    return json(500, { name: "application_error", message: `unhandled ${method} ${p}`, statusCode: 500 });
  };
  return { db, urls, emails, fetchImpl };
}
async function withApi(api, fn) {
  const orig = globalThis.fetch;
  globalThis.fetch = api.fetchImpl;
  try {
    return await fn(new Resend("re_test_dummy"));
  } finally {
    globalThis.fetch = orig;
  }
}
const noEmailInUrls = (api) => ok(!api.urls.some((u) => /@|%40/.test(u)), `URL에 이메일: ${api.urls.find((u) => /@|%40/.test(u))}`);

await t("SDK: 확인 메일 발송은 POST /emails 본문에만 이메일, 발신 AI마중 <letter@aimajung.com>", async () => {
  const api = fakeResendApi();
  await withApi(api, (resend) => sub.createResendMailer(resend, { from: "AI마중 <letter@aimajung.com>" }).sendConfirmation("reader@example.com", "https://aimajung.com/newsletter/confirm/#token=abc"));
  eq(api.urls, ["POST /emails"]);
  eq(api.emails[0].from, "AI마중 <letter@aimajung.com>");
  eq(api.emails[0].to, ["reader@example.com"]);
  eq(api.emails[0].subject, "AI마중 뉴스레터 구독을 확인해 주세요");
  ok(api.emails[0].html.includes("#token=abc") && api.emails[0].text.includes("#token=abc"), "링크 없음");
  ok(!("reply_to" in api.emails[0]) || api.emails[0].reply_to == null, "Reply-To가 비어 있어야 함");
});
await t("SDK: 신청 전체 흐름 → Resend 요청은 POST /emails 하나뿐, 연락처 0개 (확인 전 구독자 아님)", async () => {
  const api = fakeResendApi();
  const r = await withApi(api, (resend) => sub.handleSubscribe(req(valid), subCtx(sub.createResendMailer(resend, { from: "AI마중 <letter@aimajung.com>" }, 1))));
  eq(r.body.code, "confirmation_sent");
  eq(api.urls, ["POST /emails"]);
  eq(api.db.length, 0);
  ok(api.emails[0].html.includes("https://aimajung.com/newsletter/confirm/#token="), "확인 링크 없음");
});
await t("SDK: 새 구독자 확인 → POST /contacts(Segment·interests 포함) + GET /contacts/{id}, URL에 이메일 없음", async () => {
  const api = fakeResendApi();
  const r = await withApi(api, (resend) => sub.createResendStore(resend, SEG, { retryDelayMs: 1 }).confirm("reader@example.com", ["ai-news", "chatgpt-openai"]));
  eq(r, "subscribed");
  eq(api.urls, ["POST /contacts", "GET /contacts/ct_new0"]);
  eq(api.db[0].segments, [SEG]);
  eq(api.db[0].properties, { interests: "ai-news,chatgpt-openai" });
  eq(api.db[0].unsubscribed, false);
  noEmailInUrls(api);
});
await t("SDK: 이미 구독 중(생성 오류 응답) → 목록에서 id 찾기, already, 중복 연락처·Segment 없음", async () => {
  const others = Array.from({ length: 150 }, (_, i) => ({ email: `p${i}@example.com` }));
  const api = fakeResendApi({ contacts: [...others, { email: "reader@example.com", id: "ct_reader" }] });
  const r = await withApi(api, (resend) => sub.createResendStore(resend, SEG, { retryDelayMs: 1 }).confirm("reader@example.com", ["claude"]));
  eq(r, "already");
  eq(api.db.filter((c) => c.email === "reader@example.com").length, 1);
  eq(api.db.find((c) => c.id === "ct_reader").segments, [SEG]);
  ok(api.urls.includes("GET /contacts?limit=100") && api.urls.some((u) => u.startsWith("GET /contacts?limit=100&after=")), "두 쪽 넘김");
  noEmailInUrls(api);
});
await t("SDK: 해지했던 주소 → PATCH unsubscribed:false·interests + Segment 재등록", async () => {
  const api = fakeResendApi({ contacts: [{ email: "reader@example.com", id: "ct_r", unsubscribed: true, segments: [] }] });
  const r = await withApi(api, (resend) => sub.createResendStore(resend, SEG, { retryDelayMs: 1 }).confirm("reader@example.com", ["gemini"]));
  eq(r, "subscribed");
  const c = api.db[0];
  eq([c.unsubscribed, c.segments, c.properties], [false, [SEG], { interests: "gemini" }]);
  ok(api.urls.includes("PATCH /contacts/ct_r") && api.urls.includes(`POST /contacts/ct_r/segments/${SEG}`), "갱신·등록 호출");
  noEmailInUrls(api);
});
await t("SDK: 생성이 기존 id를 돌려주는 경우(upsert)도 id로 상태를 맞춤", async () => {
  const api = fakeResendApi({ mode: "upsert", contacts: [{ email: "reader@example.com", id: "ct_u", unsubscribed: true, segments: [] }] });
  eq(await withApi(api, (resend) => sub.createResendStore(resend, SEG, { retryDelayMs: 1 }).confirm("reader@example.com", [])), "subscribed");
  eq([api.db[0].unsubscribed, api.db[0].segments], [false, [SEG]]);
  noEmailInUrls(api);
});
await t("SDK: 같은 토큰으로 두 번 확인 → 연락처 1개, Segment 1번", async () => {
  const api = fakeResendApi();
  await withApi(api, async (resend) => {
    const store = sub.createResendStore(resend, SEG, { retryDelayMs: 1, now: () => Date.now() + 10 * 60_000 });
    await store.confirm("reader@example.com", ["claude"]);
    eq(await store.confirm("reader@example.com", ["claude"]), "already");
  });
  eq(api.db.length, 1);
  eq(api.db[0].segments, [SEG]);
  noEmailInUrls(api);
});
await t("SDK: 진짜 검증 오류(속성 없음 등)는 목록에서 못 찾으면 그대로 실패", async () => {
  const api = fakeResendApi();
  let err = null;
  await withApi(api, (resend) => sub.createResendStore(resend, SEG, { retryDelayMs: 1 }).confirm("reader@example.com", []).catch((e) => (err = e)));
  ok(err === null, "정상 경로");
  const api2 = fakeResendApi();
  const orig = api2.fetchImpl;
  api2.fetchImpl = (input, init) => (String(input).endsWith("/contacts") && init?.method === "POST" ? Promise.resolve(new Response(JSON.stringify({ name: "validation_error", message: "property interests does not exist", statusCode: 422 }), { status: 422 })) : orig(input, init));
  await withApi(api2, (resend) => sub.createResendStore(resend, SEG, { retryDelayMs: 1 }).confirm("reader@example.com", []).catch((e) => (err = e)));
  ok(err instanceof sub.StoreError && err.reason === "validation_error", `오류 이유: ${err?.reason}`);
});
await t("SDK: 요청 한도(429)에 걸리면 잠깐 쉬고 다시 시도", async () => {
  const api = fakeResendApi({ throttleOnce: true });
  eq(await withApi(api, (resend) => sub.createResendStore(resend, SEG, { retryDelayMs: 1 }).confirm("reader@example.com", [])), "subscribed");
  eq(api.urls[0], api.urls[1]);
});

await t("로그에 이메일 전체가 남지 않음", async () => {
  ok(logs.length > 10, "로그 없음");
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
  ok(sendSettings({}, nc).problems.length >= 2, "빈 설정 통과");
  ok(sendSettings({ RESEND_API_KEY: "k", RESEND_AUDIENCE_ID: "s", NEWSLETTER_FROM_EMAIL: "news@example-project.vercel.app" }, nc).problems.some((p) => p.includes("vercel.app")), "vercel.app 통과");
  eq(sendSettings({ RESEND_API_KEY: "k", RESEND_AUDIENCE_ID: "s", NEWSLETTER_FROM_EMAIL: "news@example.org" }, nc).problems, []);
  eq(sendSettings({ RESEND_API_KEY: "k", RESEND_AUDIENCE_ID: "s", NEWSLETTER_FROM_EMAIL: "news@example.org" }, nc).from, "AI마중 <news@example.org>");
});

// ---------- 2-2) 편집 호 (newsletter/editions) ----------

const { EDITIONS_DIR, loadEdition, renderEditionEmail, editionSlugs } = await import("./lib.mjs");
const editionIds = fs.existsSync(EDITIONS_DIR) ? fs.readdirSync(EDITIONS_DIR).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, "")) : [];
const storyBySlug = new Map(stories.map((s) => [s.slug, s]));
/** 기사에 실제로 들어 있는 글 전체 (숫자 출처 대조용) */
const corpusOf = (s) =>
  [s.title, s.summary, ...s.facts, s.whyItMatters, s.whatChanges, s.lead ?? "", s.eventDate, ...(s.sections ?? []).flatMap((x) => [x.heading, ...x.paragraphs, ...x.bullets])].join("\n");
const numbersIn = (t) => (String(t).match(/\d+(?:\.\d+)?/g) ?? []).map((n) => n.replace(/^0+(?=\d)/, ""));

for (const id of editionIds) {
  const ed = loadEdition(id);
  const opts = (mode) => ({ mode, allStories: stories, config });
  await t(`편집 호 ${id}: 모든 기사가 실제 기사이고 ${ed.webIssueDate} 호에 속함`, async () => {
    for (const slug of editionSlugs(ed)) {
      const s = storyBySlug.get(slug);
      ok(s, `없는 기사 ${slug}`);
      eq(s.eventDate, ed.webIssueDate, slug);
    }
    eq(ed.id, id);
  });
  await t(`편집 호 ${id}: 숫자는 모두 해당 기사에 있는 숫자 (지어낸 수치 없음)`, async () => {
    const all = editionSlugs(ed).map((slug) => corpusOf(storyBySlug.get(slug))).join("\n");
    const allNums = new Set(numbersIn(all));
    const check = (text, corpusNums, where) => {
      for (const n of numbersIn(text)) ok(corpusNums.has(n), `${where}: 숫자 ${n}이 기사에 없음 — "${String(text).slice(0, 40)}…"`);
    };
    const mainNums = new Set(numbersIn(corpusOf(storyBySlug.get(ed.main.slug))));
    const keyNums = (ed.main.keyNumbers ?? []).flatMap((k) => [k.value, k.label]);
    for (const x of [ed.main.title, ...ed.main.body, ...(ed.main.facts ?? []), ...keyNums, ed.main.point]) check(x, mainNums, "메인");
    for (const m of ed.more) {
      const nums = new Set(numbersIn(corpusOf(storyBySlug.get(m.slug))));
      for (const x of [m.title ?? "", m.change, m.why]) check(x, nums, m.slug);
    }
    for (const x of [ed.subject, ed.preheader, ...ed.intro, ed.dayPoint?.fact ?? "", ed.dayPoint?.opinion ?? ""]) check(x, allNums, "제목·도입·POINT");
  });
  await t(`편집 호 ${id}: 렌더링 — 섹션 구성·빈 섹션 숨김·링크·자리표시자 없음`, async () => {
    for (const mode of ["preview", "test", "broadcast"]) {
      const { html, text, subject, preheader } = renderEditionEmail(ed, opts(mode));
      const both = html + text;
      ok(!/undefined|null|NaN|\[object Object\]|TODO|lorem|PREVIEW_TOKEN|XXX/i.test(both.replace("{{{RESEND_UNSUBSCRIBE_URL}}}", "")), `${mode}: 자리표시자·미치환 값`);
      ok(!/<script|javascript:|onclick=|<img/i.test(html), `${mode}: 스크립트·이미지`);
      ok(/<table[^>]+width="640"/.test(html) && /max-width: 640px/.test(html), `${mode}: 640px·모바일 규칙`);
      ok(!/display:\s*flex|display:\s*grid|position:\s*(absolute|fixed)|@import|<link /i.test(html), `${mode}: 메일 앱에서 깨지기 쉬운 CSS`);
      const labels = ["🔥 오늘의 메인", "⚡ 놓치면 아쉬운 변화", "왜 봐야 하나", ed.dateLine];
      if (ed.main.facts?.length) labels.push("핵심 사실");
      if (ed.main.keyNumbers?.length) labels.push("핵심 숫자", ...ed.main.keyNumbers.map((k) => k.value));
      if (ed.main.point) labels.push("이 뉴스의 POINT");
      if (ed.dayPoint) labels.push("📌 오늘의 흐름", "확인된 사실", "AI마중의 해석");
      for (const label of labels)
        ok(both.includes(label), `${mode}: '${label}' 없음`);
      eq(ed.checked.length === 0, !both.includes("🧪"), `${mode}: 🧪 표시 조건`);
      eq(ed.readMore.length === 0, !both.includes("📚"), `${mode}: 📚 표시 조건`);
      const urls = [...new Set(html.match(/href="([^"]+)"/g).map((h) => h.slice(6, -1)))];
      for (const u of urls) ok(u === "{{{RESEND_UNSUBSCRIBE_URL}}}" || u.startsWith("https://aimajung.com/"), `${mode}: 공식 주소가 아닌 링크 ${u}`);
      for (const slug of editionSlugs(ed)) ok(urls.includes(`https://aimajung.com/stories/${slug}/`), `${mode}: 기사 링크 없음 ${slug}`);
      ok(urls.includes(`https://aimajung.com/newsletters/${ed.webIssueDate}/`) && urls.includes("https://aimajung.com/newsletters/"), `${mode}: 웹에서 보기·지난 호`);
      if (mode === "broadcast") ok(html.includes("{{{RESEND_UNSUBSCRIBE_URL}}}") && text.includes("{{{RESEND_UNSUBSCRIBE_URL}}}"), "broadcast 수신거부");
      else ok(urls.includes("https://aimajung.com/newsletter/unsubscribe/"), `${mode}: 수신거부 안내`);
      ok(!/[\w.+-]+@[\w-]+\.[\w.]+/.test(html.replace(/xmlns="[^"]+"/, "")), `${mode}: 이메일 주소 노출`);
      eq([subject, preheader], [ed.subject, ed.preheader]);
    }
  });
  await t(`편집 호 ${id}: 제목·프리헤더 원칙`, async () => {
    ok(!/뉴스레터|\d{1,2}월\s*\d{1,2}일|\[AI마중\]/.test(ed.subject), "관리형 제목");
    ok(ed.subject.length <= 60, `제목이 김 (${ed.subject.length}자)`);
    const words = (s) => new Set(s.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((w) => w.length > 1));
    const sw = words(ed.subject);
    const overlap = [...words(ed.preheader)].filter((w) => sw.has(w)).length;
    ok(overlap <= 1, `프리헤더가 제목을 되풀이 (${overlap}단어)`);
    ok(ed.preheader.length >= 30 && ed.preheader.length <= 110, `프리헤더 길이 ${ed.preheader.length}`);
  });
}

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
