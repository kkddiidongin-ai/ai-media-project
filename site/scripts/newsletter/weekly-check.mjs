#!/usr/bin/env node
/**
 * 주간 뉴스레터 점검 (npm run qa:weekly) — 외부 접속 없음, 실제 메일 발송 없음.
 * Resend는 mock 클라이언트, Production 사이트맵은 mock fetch. 모든 파일은 임시 폴더에 쓴다 (저장소 데이터는 건드리지 않음).
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { audit } from "../qa/quality-rules.mjs";
import { ROOT, loadConfig, loadEdition, loadStories, renderEditionEmail } from "./lib.mjs";
import {
  addDays,
  approvalProblems,
  buildWeeklyEdition,
  contentHash,
  editionIdFor,
  kstDate,
  prepareWeekly,
  qaWeekly,
  redact,
  shortHash,
  weekPeriod,
} from "./weekly.mjs";
import { Stop, approveWeekly, classify, sendWeekly } from "./weekly-delivery.mjs";

const config = await loadConfig();
const REAL = loadStories();
const SITE = config.siteConfig.url.replace(/\/$/, "");
const ID = "2026-10-11";
const PERIOD = weekPeriod(ID);

const FAKE_KEY = "re_FAKEKEY_weekly_test_0123456789abcdef";
const FAKE_SECRET = "approval-secret-FAKE-0123456789-abcdefghijkl";
const REPLY = "reply-box@example.com";
const OPERATOR = "발행: AI마중 테스트 운영자 · 연락처 02-000-0000 · 서울시 테스트구";
const ENV = { RESEND_API_KEY: FAKE_KEY, NEWSLETTER_APPROVAL_SECRET: FAKE_SECRET, RESEND_AUDIENCE_ID: "seg-general", NEWSLETTER_REPLY_TO: REPLY, NEWSLETTER_OPERATOR_INFO: OPERATOR };

const sha = (p) => (fs.existsSync(p) ? crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex") : null);
const PROTECTED = [path.join(ROOT, "ingest/newsletter-sent.json"), path.join(ROOT, "newsletter/editions/2026-10-06.json")];
const protectedBefore = PROTECTED.map(sha);

// ---------- 시험용 기사: 실제 PASS 기사를 복제해 slug·날짜만 바꾼다 (문장은 실제 기사 그대로) ----------
const pool = [];
const companies = new Set();
const products = new Set();
for (const s of REAL) {
  if (pool.length >= 7) break;
  if (s.priority > 2 || s.editorialDepth === "short" || audit(s).status !== "PASS") continue;
  const c = s.companies?.[0];
  if (!c || companies.has(c) || (s.products ?? []).some((p) => products.has(p.toLowerCase()))) continue;
  companies.add(c);
  for (const p of s.products ?? []) products.add(p.toLowerCase());
  pool.push(s);
}
assert.ok(pool.length >= 7, "시험용 기사 7건을 고르지 못함");
const fx = (i, over = {}) => ({ ...structuredClone(pool[i]), slug: `fx-${i}-${pool[i].slug}`.slice(0, 80), status: "published", publishedAt: "2026-10-06", eventDate: "2026-10-05", ...over });
const live = (stories) => new Set(stories.map((s) => s.slug));

function tmp() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "aimajung-weekly-"));
  const o = { root: d, dir: path.join(d, "weekly"), editionsDir: path.join(d, "editions"), sentFile: path.join(d, "sent.json"), logDir: path.join(d, "log") };
  fs.mkdirSync(o.editionsDir, { recursive: true });
  return o;
}
function sitemapFetch(slugs, calls = []) {
  return async (url) => {
    calls.push(String(url));
    const xml = `<?xml version="1.0"?><urlset>${[...slugs].map((s) => `<url><loc>${SITE}/stories/${s}/</loc></url>`).join("")}</urlset>`;
    return { ok: true, status: 200, text: async () => xml };
  };
}

/** mock Resend: 호출을 모두 기록한다 */
function mockResend({ members = [], totalContacts = null, segment = { id: "seg-general", name: "General" }, broadcasts = [], onSend = null, onEmail = null } = {}) {
  const calls = [];
  const store = new Map(broadcasts.map((b) => [b.id, { ...b }]));
  let n = 0;
  let sends = 0;
  const emailAttempts = new Map();
  const r = {
    calls,
    store,
    segments: {
      get: async (id) => (calls.push(["segments.get"]), id === segment.id ? { data: segment, error: null } : { data: null, error: { name: "not_found", statusCode: 404 } }),
      list: async () => (calls.push(["segments.list"]), { data: { data: [segment] }, error: null }),
    },
    contacts: {
      list: async (opts = {}) => {
        calls.push(["contacts.list", opts.segmentId ? "segment" : "all"]);
        if (opts.segmentId) return { data: { data: members, has_more: false }, error: null };
        const total = totalContacts ?? members.length;
        return { data: { data: Array.from({ length: total }, (_, i) => ({ id: `c-${i}` })), has_more: false }, error: null };
      },
    },
    broadcasts: {
      list: async () => (calls.push(["broadcasts.list"]), { data: { data: [...store.values()].map((b) => ({ id: b.id, name: b.name, status: b.status })), has_more: false }, error: null }),
      create: async (p) => {
        calls.push(["broadcasts.create"]);
        const id = `bc-${++n}`;
        store.set(id, { id, name: p.name, status: "draft", segment_id: p.segmentId, from: p.from, subject: p.subject, reply_to: p.replyTo ? [p.replyTo] : null, html: p.html, text: p.text });
        return { data: { id }, error: null };
      },
      get: async (id) => (calls.push(["broadcasts.get"]), store.has(id) ? { data: store.get(id), error: null } : { data: null, error: { name: "not_found", statusCode: 404 } }),
      send: async (id) => {
        calls.push(["broadcasts.send"]);
        sends++;
        if (onSend) return onSend(sends, store.get(id));
        store.get(id).status = "sent";
        return { data: { id }, error: null };
      },
    },
    emails: {
      send: async (p, opts) => {
        const to = p.to[0];
        const k = emailAttempts.get(to) ?? 0;
        emailAttempts.set(to, k + 1);
        calls.push(["emails.send", opts?.idempotencyKey ?? null]);
        if (onEmail) return onEmail(to, k + 1, opts);
        return { data: { id: `em-${calls.length}` }, error: null };
      },
    },
  };
  return r;
}
const sendCount = (r) => r.calls.filter((c) => c[0] === "broadcasts.send").length;
const subscribers = (n, extra = []) => [...Array.from({ length: n }, (_, i) => ({ id: `ct-${i}`, email: `reader${i}@example.com`, unsubscribed: false })), ...extra];

/** 표준 준비: 정상 기사 5건 */
async function prepared(o = tmp(), stories = [0, 1, 2, 3, 4].map((i) => fx(i)), extra = {}) {
  const r = await prepareWeekly({ id: ID, stories, config, env: {}, fetchImpl: sitemapFetch(live(stories)), dir: o.dir, editionsDir: o.editionsDir, sentFile: o.sentFile, now: new Date("2026-10-11T00:05:00Z"), ...extra });
  return { o, stories, r };
}
const common = (o, stories, extra = {}) => ({ id: ID, env: ENV, stories, config, fetchImpl: sitemapFetch(live(stories)), dir: o.dir, editionsDir: o.editionsDir, sentFile: o.sentFile, logDir: o.logDir, sleep: async () => {}, log: () => {}, ...extra });
async function approved(members = subscribers(3), extra = {}) {
  const p = await prepared();
  const resend = mockResend({ members, ...extra });
  await approveWeekly({ ...common(p.o, p.stories), resend, hashArg: shortHash(p.r.state.contentHash), approver: "editor-kim", confirm: async () => `승인 ${ID}` });
  return { ...p, resend, hash: shortHash(p.r.state.contentHash) };
}
const sendArgs = (p, resend, extra = {}) => ({ ...common(p.o, p.stories), resend, mode: "send", confirmArg: ID, hashArg: p.hash, expectRecipients: 3, confirm: async () => `발송 ${ID}`, ...extra });
async function rejects(fn, re) {
  try {
    await fn();
  } catch (e) {
    if (re && !re.test(e.message)) throw new Error(`다른 이유로 멈춤: ${e.message}`);
    return e;
  }
  throw new Error("멈춰야 하는데 통과함");
}
const readState = (o) => JSON.parse(fs.readFileSync(path.join(o.dir, ID, "state.json"), "utf8"));

// ---------- 시험 ----------
const tests = [];
const t = (name, fn) => tests.push({ name, fn });

t("주차 계산: 일요일 ID · 실행 지연 · 대상 기간", () => {
  assert.equal(kstDate(new Date("2026-10-11T00:00:00Z")), "2026-10-11"); // 일 09:00 KST
  assert.equal(editionIdFor(kstDate(new Date("2026-10-10T23:59:00Z"))), "2026-10-11"); // 일 08:59 KST
  assert.equal(editionIdFor(kstDate(new Date("2026-10-11T14:59:00Z"))), "2026-10-11"); // 일 23:59 KST (15시간 지연)
  assert.equal(editionIdFor(kstDate(new Date("2026-10-11T16:00:00Z"))), "2026-10-11"); // 월 01:00 KST — 같은 주 일요일 호
  assert.equal(editionIdFor(kstDate(new Date("2026-10-10T14:00:00Z"))), "2026-10-04"); // 토 23:00 KST — 이전 호
  assert.deepEqual(weekPeriod(ID), { start: "2026-10-04", end: "2026-10-10" });
  assert.throws(() => weekPeriod("2026-10-12"));
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
});

t("주간 기사 0건 → HOLD, 원고 없음, 발송 불가", async () => {
  const { o, r } = await prepared(tmp(), [fx(0, { publishedAt: "2026-09-20" })]);
  assert.equal(r.status, "HOLD");
  assert.ok(r.qa.items.some((i) => i.code === "EMPTY"));
  assert.ok(!fs.existsSync(path.join(o.dir, ID, "edition.json")));
  assert.match(fs.readFileSync(path.join(o.dir, ID, "report.md"), "utf8"), /발송 가능 여부 \| \*\*아니오/);
});

t("기사 부족 → HOLD (억지로 채우지 않음, 최소 기사 수는 설정)", async () => {
  const stories = [fx(0), fx(1), fx(2, { priority: 3 })]; // 중요도 3은 주요 기사로 쓰지 않음
  const { r } = await prepared(tmp(), stories);
  assert.equal(r.status, "HOLD");
  assert.ok(r.qa.items.some((i) => i.code === "TOO_FEW"));
  assert.equal(r.edition.more.length, 1);
  assert.equal(r.edition.readMore.length, 1);
  const { r: r2 } = await prepared(tmp(), stories, { env: { NEWSLETTER_WEEKLY_MIN_STORIES: "2" } });
  assert.notEqual(r2.status, "HOLD");
});

t("정상 초안: READY · 기사 문장 그대로 · 링크 · 미리보기 · 구독 해지 · AI 호출 없음", async () => {
  const { o, stories, r } = await prepared();
  assert.equal(r.status, "READY", JSON.stringify(r.qa.items));
  const e = r.edition;
  const by = new Map(stories.map((s) => [s.slug, s]));
  assert.equal(e.main.title, by.get(e.main.slug).title);
  for (const m of e.more) {
    assert.equal(m.change, by.get(m.slug).summary);
    assert.equal(m.why, by.get(m.slug).whyItMatters);
    assert.equal(m.source.url, by.get(m.slug).sourceUrl);
  }
  for (const f of e.main.facts) assert.ok(by.get(e.main.slug).facts.includes(f));
  const html = fs.readFileSync(path.join(o.dir, ID, "preview.html"), "utf8");
  for (const s of [e.main, ...e.more]) {
    assert.ok(html.includes(`${SITE}/stories/${s.slug}/`));
    assert.ok(html.includes(by.get(s.slug).sourceUrl.replace(/&/g, "&amp;")));
  }
  assert.ok(html.includes("구독 해지") && !html.includes("웹에서 보기"));
  const bc = renderEditionEmail(e, { mode: "broadcast", allStories: stories, config });
  assert.ok(bc.html.includes("{{{RESEND_UNSUBSCRIBE_URL}}}") && bc.text.includes("{{{RESEND_UNSUBSCRIBE_URL}}}"));
  const report = fs.readFileSync(path.join(o.dir, ID, "report.md"), "utf8");
  for (const want of ["대상 주간", "이메일 제목", "선정 기사", "발송 대상 예상 인원", "자동 QA", "수정 필요 사항", "발송 가능 여부", "preview.html", "merge해도 승인·발송되지 않습니다"]) assert.ok(report.includes(want), want);
  assert.match(report, /READY — 자동 검증 통과\. \*\*승인 아님\*\*/);
});

t("동일 주차 재실행: 같은 내용이면 파일·이력 그대로 (중복 원고 없음)", async () => {
  const { o, stories } = await prepared();
  const files = fs.readdirSync(path.join(o.dir, ID));
  const before = files.map((f) => sha(path.join(o.dir, ID, f)));
  const again = await prepareWeekly({ id: ID, stories, config, env: {}, fetchImpl: sitemapFetch(live(stories)), dir: o.dir, editionsDir: o.editionsDir, sentFile: o.sentFile, now: new Date("2026-10-11T03:00:00Z") });
  assert.equal(again.changed, false);
  assert.deepEqual(fs.readdirSync(path.join(o.dir, ID)), files);
  assert.deepEqual(files.map((f) => sha(path.join(o.dir, ID, f))), before);
  assert.equal(fs.readdirSync(o.dir).length, 1);
});

t("편집자가 고친 원고는 재실행이 덮어쓰지 않음 (QA만 다시)", async () => {
  const { o, stories } = await prepared();
  const p = path.join(o.dir, ID, "edition.json");
  const e = JSON.parse(fs.readFileSync(p, "utf8"));
  e.intro = ["이번 주 소식을 골랐습니다."];
  fs.writeFileSync(p, JSON.stringify(e, null, 2) + "\n");
  const r = await prepareWeekly({ id: ID, stories, config, env: {}, fetchImpl: sitemapFetch(live(stories)), dir: o.dir, editionsDir: o.editionsDir, sentFile: o.sentFile });
  assert.equal(r.edited, true);
  assert.deepEqual(JSON.parse(fs.readFileSync(p, "utf8")).intro, ["이번 주 소식을 골랐습니다."]);
  assert.ok(r.qa.items.some((i) => i.code === "INTRO_EDITED"));
  assert.equal(r.status, "DRAFT");
});

t("PR 중복 생성 방지: 같은 호 = 같은 브랜치, 열린 PR은 갱신, master와 같으면 새 PR 없음", () => {
  const y = fs.readFileSync(path.join(ROOT, "../.github/workflows/newsletter-weekly.yml"), "utf8");
  assert.match(y, /B="newsletter\/weekly-\$E"/);
  assert.match(y, /gh pr list --head "\$B" --state open/);
  assert.match(y, /gh pr edit "\$PR"/);
  assert.match(y, /git diff --quiet "origin\/\$BASE" HEAD -- "newsletter\/weekly\/\$E"/);
  assert.match(y, /Restore earlier results for this edition/);
  assert.match(y, /concurrency:\s*\n\s*group: aimajung-newsletter-weekly/);
  assert.ok(!/git push[^\n]*(--force|-f\b)/.test(y));
});

t("미발행 기사 · Production 사이트맵에 없는 기사 제외", async () => {
  const stories = [0, 1, 2, 3].map((i) => fx(i));
  stories.push(fx(4, { status: "draft" }));
  stories.push(fx(5));
  const notLive = live(stories);
  notLive.delete(stories[5].slug);
  const o = tmp();
  const r = await prepareWeekly({ id: ID, stories, config, env: {}, fetchImpl: sitemapFetch(notLive), dir: o.dir, editionsDir: o.editionsDir, sentFile: o.sentFile });
  const row = (s) => r.state.selection.find((x) => x.slug === s.slug);
  assert.equal(row(stories[4]).decision, "EXCLUDE");
  assert.match(row(stories[4]).reasons.join(), /미발행/);
  assert.equal(row(stories[5]).decision, "EXCLUDE");
  assert.match(row(stories[5]).reasons.join(), /Production/);
});

t("Production 확인 실패 → HOLD (성공한 척하지 않음)", async () => {
  const stories = [0, 1, 2].map((i) => fx(i));
  const o = tmp();
  const r = await prepareWeekly({ id: ID, stories, config, env: {}, fetchImpl: async () => ({ ok: false, status: 503, text: async () => "" }), dir: o.dir, editionsDir: o.editionsDir, sentFile: o.sentFile });
  assert.equal(r.status, "HOLD");
  assert.ok(r.qa.items.some((i) => i.code === "PRODUCTION"));
});

t("QA FAIL 기사 · 오래된 소식 · 이미 보낸 기사 · 같은 주제 중복 제외", async () => {
  const bad = fx(0, { facts: [], summary: "짧음", whyItMatters: "", whatChanges: "", editorialDepth: "short", sections: undefined, lead: undefined });
  assert.equal(audit(bad).status, "FAIL");
  const stale = fx(1, { eventDate: "2026-06-01" });
  const sent = fx(2);
  const twin = { ...fx(3), slug: "fx-twin", title: fx(3).title };
  const stories = [bad, stale, sent, fx(3), twin, fx(4), fx(5)];
  const o = tmp();
  fs.writeFileSync(path.join(o.editionsDir, "2026-10-06.json"), JSON.stringify({ id: "2026-10-06", main: { slug: sent.slug }, more: [], readMore: [] }));
  const r = await prepareWeekly({ id: ID, stories, config, env: {}, fetchImpl: sitemapFetch(live(stories)), dir: o.dir, editionsDir: o.editionsDir, sentFile: o.sentFile });
  const why = (s) => r.state.selection.find((x) => x.slug === s.slug).reasons.join();
  assert.match(why(bad), /기사 QA FAIL/);
  assert.match(why(stale), /최신 소식 아님/);
  assert.match(why(sent), /이미 2026-10-06 호에 실림/);
  assert.match([why(twin), why(fx(3))].join(), /같은 주제 중복/);
  const inEdition = [r.edition.main.slug, ...r.edition.more.map((m) => m.slug), ...r.edition.readMore.map((m) => m.slug)];
  for (const s of [bad, stale, sent]) assert.ok(!inEdition.includes(s.slug));
});

t("기사에 없는 숫자를 넣으면 FAIL (사실·수치를 새로 만들지 않음)", async () => {
  const { stories, r } = await prepared();
  const e = structuredClone(r.edition);
  e.main.body = [`${e.main.body[0]} 사용자는 987654명입니다.`];
  const q = qaWeekly(e, { stories, period: PERIOD, production: { ok: true, slugs: live(stories) }, used: new Map(), cfg: { minStories: 3, maxEventAgeDays: 14 }, config, inPeriod: r.state.selection.length });
  assert.equal(q.verdict, "FAIL");
  assert.ok(q.items.some((i) => i.code === "NUMBER" && /987654/.test(i.msg)));
});

t("승인 없는 발송 차단 (READY도 발송 불가, 발송 API 0회)", async () => {
  const { o, stories, r } = await prepared();
  const resend = mockResend({ members: subscribers(3) });
  await rejects(() => sendWeekly({ ...common(o, stories), resend, mode: "send", confirmArg: ID, hashArg: shortHash(r.state.contentHash), expectRecipients: 3, confirm: async () => `발송 ${ID}` }), /READY — 승인\(APPROVED\)된 호만/);
  assert.equal(resend.calls.length, 0);
});

t("승인: 비밀값·해시·입력 확인·발행인 정보가 없으면 거부, 파일 수정만으로는 승인 안 됨", async () => {
  const { o, stories, r } = await prepared();
  const resend = mockResend({ members: subscribers(3) });
  const base = { ...common(o, stories), resend, hashArg: shortHash(r.state.contentHash), approver: "editor-kim", confirm: async () => `승인 ${ID}` };
  await rejects(() => approveWeekly({ ...base, env: { ...ENV, NEWSLETTER_APPROVAL_SECRET: "" } }), /NEWSLETTER_APPROVAL_SECRET/);
  await rejects(() => approveWeekly({ ...base, hashArg: "000000000000" }), /--hash/);
  await rejects(() => approveWeekly({ ...base, approver: "a@b.com" }), /--approver/);
  await rejects(() => approveWeekly({ ...base, env: { ...ENV, NEWSLETTER_OPERATOR_INFO: "" } }), /발행인 정보/);
  await rejects(() => approveWeekly({ ...base, confirm: async () => "승인" }), /취소/);
  assert.equal(readState(o).status, "READY");
  // 사람이 state.json을 직접 APPROVED로 바꿔도(서명 없음·가짜 서명) 발송되지 않는다
  const s = readState(o);
  fs.writeFileSync(path.join(o.dir, ID, "state.json"), JSON.stringify({ ...s, status: "APPROVED", approval: { id: ID, contentHash: s.contentHash, approver: "x", approvedAt: "2026-10-11T00:00:00Z", signature: "f".repeat(64) } }));
  await rejects(() => sendWeekly({ ...common(o, stories), resend, mode: "send", confirmArg: ID, hashArg: shortHash(s.contentHash), expectRecipients: 3, confirm: async () => `발송 ${ID}` }), /서명이 맞지 않음/);
  assert.equal(sendCount(resend), 0);
});

t("DRAFT(확인 필요)는 --ack-review 없이는 승인 안 됨", async () => {
  const stories = [0, 1, 2, 3].map((i) => fx(i));
  stories.push(fx(4, { priority: 1 }));
  const { o, r } = await prepared(tmp(), stories);
  const e = JSON.parse(fs.readFileSync(path.join(o.dir, ID, "edition.json"), "utf8"));
  e.intro = ["이번 주 골라 본 소식입니다."];
  fs.writeFileSync(path.join(o.dir, ID, "edition.json"), JSON.stringify(e, null, 2) + "\n");
  const r2 = await prepareWeekly({ id: ID, stories, config, env: {}, fetchImpl: sitemapFetch(live(stories)), dir: o.dir, editionsDir: o.editionsDir, sentFile: o.sentFile });
  assert.equal(r2.status, "DRAFT");
  const resend = mockResend({ members: subscribers(3) });
  const base = { ...common(o, stories), resend, hashArg: shortHash(r2.state.contentHash), approver: "editor-kim", confirm: async () => `승인 ${ID}` };
  await rejects(() => approveWeekly(base), /--ack-review/);
  const ok = await approveWeekly({ ...base, ackReview: true });
  assert.equal(ok.status, "APPROVED");
  assert.equal(ok.approval.checks.ackReview, true);
  assert.ok(r.state.contentHash !== r2.state.contentHash);
});

t("승인 후 원고 수정 → 승인 무효 (발송 차단, 재준비 시 승인 해제)", async () => {
  const p = await approved();
  const ep = path.join(p.o.dir, ID, "edition.json");
  const e = JSON.parse(fs.readFileSync(ep, "utf8"));
  e.subject = `${e.subject} !`;
  fs.writeFileSync(ep, JSON.stringify(e, null, 2) + "\n");
  assert.ok(approvalProblems(readState(p.o), e, FAKE_SECRET).some((x) => /승인 뒤 원고가 바뀜/.test(x)));
  await rejects(() => sendWeekly(sendArgs(p, p.resend)), /승인 뒤 원고가 바뀜|--hash/);
  await rejects(() => sendWeekly(sendArgs(p, p.resend, { hashArg: shortHash(contentHash(e)) })), /승인 뒤 원고가 바뀜/);
  assert.equal(sendCount(p.resend), 0);
  const r = await prepareWeekly({ id: ID, stories: p.stories, config, env: {}, fetchImpl: sitemapFetch(live(p.stories)), dir: p.o.dir, editionsDir: p.o.editionsDir, sentFile: p.o.sentFile });
  assert.notEqual(r.status, "APPROVED");
  assert.equal(r.state.approval, null);
  assert.ok(r.state.history.some((h) => h.event === "approval-invalidated"));
});

t("승인된 edition은 정확히 1회 발송 · 기록 · 두 번째 발송 차단", async () => {
  const p = await approved();
  const resend = mockResend({ members: subscribers(3) });
  const out = await sendWeekly(sendArgs(p, resend));
  assert.equal(out.state, "accepted");
  assert.equal(sendCount(resend), 1);
  const st = readState(p.o);
  assert.equal(st.status, "SENT");
  assert.equal(st.send.state, "accepted");
  assert.match(st.send.delivery, /unknown/); // API 수락 ≠ 실제 수신
  const sent = JSON.parse(fs.readFileSync(p.o.sentFile, "utf8"));
  assert.equal(sent.length, 1);
  assert.equal(sent[0].date, ID);
  assert.equal(sent[0].kind, "weekly");
  await rejects(() => sendWeekly(sendArgs(p, resend)), /승인\(APPROVED\)된 호만|발송 기록/);
  assert.equal(sendCount(resend), 1);
  const locked = await prepareWeekly({ id: ID, stories: p.stories, config, env: {}, fetchImpl: sitemapFetch(live(p.stories)), dir: p.o.dir, editionsDir: p.o.editionsDir, sentFile: p.o.sentFile });
  assert.equal(locked.locked, true);
  assert.equal(readState(p.o).status, "SENT");
  // 기록 파일이 없어져도 Resend의 같은 호 Broadcast로 막는다
  fs.rmSync(p.o.sentFile);
  const s = readState(p.o);
  fs.writeFileSync(path.join(p.o.dir, ID, "state.json"), JSON.stringify({ ...s, status: "APPROVED", send: null }));
  await rejects(() => sendWeekly(sendArgs(p, resend)), /이미 보낸/);
  assert.equal(sendCount(resend), 1);
  const again = await prepareWeekly({ id: ID, stories: p.stories, config, env: {}, fetchImpl: sitemapFetch(live(p.stories)), dir: p.o.dir, editionsDir: p.o.editionsDir, sentFile: p.o.sentFile });
  assert.equal(again.locked, true);
});

t("발송 직전 '발송 <id>' 입력이 다르면 보내지 않음", async () => {
  const p = await approved();
  const resend = mockResend({ members: subscribers(3) });
  await rejects(() => sendWeekly(sendArgs(p, resend, { confirm: async () => "발송" })), /취소/);
  await rejects(() => sendWeekly(sendArgs(p, resend, { confirmArg: "2026-10-04" })), /--confirm 2026-10-11/);
  assert.equal(sendCount(resend), 0);
  assert.equal(readState(p.o).send, null);
});

t("동일 수신자 중복 차단: 같은 주소가 두 번 있으면 발송하지 않음", async () => {
  const p = await approved();
  const resend = mockResend({ members: subscribers(3, [{ id: "ct-dup", email: "Reader1@Example.com ", unsubscribed: false }]) });
  await rejects(() => sendWeekly(sendArgs(p, resend, { expectRecipients: 4 })), /같은 이메일 주소가 1건 중복/);
  assert.equal(sendCount(resend), 0);
  assert.ok(!resend.calls.some((c) => c[0] === "broadcasts.create"));
});

t("구독 해지자 제외: 인원은 구독 중만 세고, 기록에 제외로 남김", async () => {
  const p = await approved();
  const members = subscribers(3, [{ id: "ct-out", email: "left@example.com", unsubscribed: true }]);
  const resend = mockResend({ members });
  await rejects(() => sendWeekly(sendArgs(p, resend, { expectRecipients: 4 })), /기대 4명, 실제 구독 중 3명/);
  assert.equal(sendCount(resend), 0);
  await sendWeekly(sendArgs(p, resend, { expectRecipients: 3 }));
  const ledger = JSON.parse(fs.readFileSync(path.join(p.o.logDir, `${ID}-recipients.json`), "utf8"));
  assert.equal(ledger.recipients.filter((x) => x.state === "excluded_unsubscribed").length, 1);
  assert.equal(ledger.recipients.filter((x) => x.apiState === "accepted").length, 3);
});

t("무료 한도 초과 예상 → 발송 시작 안 함", async () => {
  const p = await approved();
  const resend = mockResend({ members: subscribers(3), totalContacts: 1001 });
  await rejects(() => sendWeekly(sendArgs(p, resend)), /무료 한도 1000명/);
  assert.equal(sendCount(resend), 0);
  assert.ok(!resend.calls.some((c) => c[0] === "broadcasts.create"));
  // 승인 단계에서도 막는다
  const q = await prepared();
  await rejects(
    () => approveWeekly({ ...common(q.o, q.stories), resend: mockResend({ members: subscribers(3), totalContacts: 5000 }), hashArg: shortHash(q.r.state.contentHash), approver: "editor-kim", confirm: async () => `승인 ${ID}` }),
    /무료 한도/,
  );
});

t("일부 수신자 발송 실패 (테스트 주소별 발송): 성공·실패를 주소별로 기록, 성공 주소는 다시 안 보냄", async () => {
  const { o, stories } = await prepared();
  const resend = mockResend({ onEmail: (to) => (to.startsWith("bad") ? { data: null, error: { name: "validation_error", statusCode: 422 } } : { data: { id: "em-1" }, error: null }) });
  const logs = [];
  const r = await sendWeekly({ ...common(o, stories), resend, mode: "test", to: ["ok1@example.com", "bad@example.com", "ok2@example.com"], log: (m) => logs.push(m) });
  assert.deepEqual(r.results.map((x) => x.state), ["accepted", "failed", "accepted"]);
  const r2 = await sendWeekly({ ...common(o, stories), resend, mode: "test", to: ["ok1@example.com", "bad@example.com"] });
  assert.deepEqual(r2.results.map((x) => x.state), ["skipped", "failed"]);
  assert.equal(readState(o).status, "READY"); // 테스트 발송은 상태를 바꾸지 않는다
  assert.ok(!resend.calls.some((c) => c[0].startsWith("broadcasts")));
});

t("네트워크 타임아웃 → uncertain · 재시도 0 · 다음 발송 차단 · reconcile로 확정", async () => {
  const p = await approved();
  const resend = mockResend({ members: subscribers(3), onSend: () => new Promise(() => {}) });
  const env = { ...ENV, NEWSLETTER_WEEKLY_SEND_TIMEOUT_MS: "30" };
  await rejects(() => sendWeekly({ ...sendArgs(p, resend), env }), /불확실/);
  assert.equal(sendCount(resend), 1);
  assert.equal(readState(p.o).send.state, "uncertain");
  await rejects(() => sendWeekly({ ...sendArgs(p, resend), env }), /중복 위험/);
  assert.equal(sendCount(resend), 1);
  // Resend에는 실제로 나간 것으로 보이는 경우 → SENT로 기록
  for (const b of resend.store.values()) b.status = "queued";
  const rc = await sendWeekly({ ...common(p.o, p.stories), env, resend, mode: "reconcile" });
  assert.equal(rc.state, "accepted");
  assert.equal(readState(p.o).status, "SENT");
  // 나가지 않은 경우: 사람이 미발송을 확인해야만 다시 보낼 수 있다
  const q = await approved();
  const r2 = mockResend({ members: subscribers(3), onSend: () => new Promise(() => {}) });
  await rejects(() => sendWeekly({ ...sendArgs(q, r2), env }), /불확실/);
  const nc = await sendWeekly({ ...common(q.o, q.stories), env, resend: r2, mode: "reconcile" });
  assert.equal(nc.state, "uncertain");
  const ok = await sendWeekly({ ...common(q.o, q.stories), env, resend: r2, mode: "reconcile", confirmNotSent: true });
  assert.equal(ok.state, "failed");
  const r3 = mockResend({ members: subscribers(3), broadcasts: [...r2.store.values()] });
  const sent = await sendWeekly({ ...sendArgs(q, r3), env });
  assert.equal(sent.state, "accepted");
  assert.ok(!r3.calls.some((c) => c[0] === "broadcasts.create")); // 남아 있던 같은 초안을 다시 씀
});

t("재시도 중 중복 방지: 429만 재시도, 재시도 전 상태가 초안이 아니면 멈춤 · 5xx는 재시도 없음", async () => {
  const p = await approved();
  const r1 = mockResend({ members: subscribers(3), onSend: (n, b) => (n === 1 ? { data: null, error: { name: "rate_limit_exceeded", statusCode: 429 } } : ((b.status = "sent"), { data: { id: b.id }, error: null })) });
  assert.equal((await sendWeekly(sendArgs(p, r1))).state, "accepted");
  assert.equal(sendCount(r1), 2);
  const q = await approved();
  const r2 = mockResend({ members: subscribers(3), onSend: (n, b) => ((b.status = "queued"), { data: null, error: { name: "rate_limit_exceeded", statusCode: 429 } }) });
  await rejects(() => sendWeekly(sendArgs(q, r2)), /초안이 아닙니다/);
  assert.equal(sendCount(r2), 1);
  const w = await approved();
  const r3 = mockResend({ members: subscribers(3), onSend: () => ({ data: null, error: { name: "internal_server_error", statusCode: 500 } }) });
  await rejects(() => sendWeekly(sendArgs(w, r3)), /불확실/);
  assert.equal(sendCount(r3), 1);
  const v = await approved();
  const r4 = mockResend({ members: subscribers(3), onSend: () => ({ data: null, error: { name: "validation_error", statusCode: 422 } }) });
  await rejects(() => sendWeekly(sendArgs(v, r4)), /거절/);
  assert.equal(readState(v.o).send.state, "failed");
  assert.equal(classify({ thrown: Object.assign(new Error("x"), { name: "TimeoutError" }) }).kind, "uncertain");
});

t("테스트 주소 시간 초과: 같은 idempotency key로만 재시도 (중복 없음)", async () => {
  const { o, stories } = await prepared();
  const resend = mockResend({ onEmail: (to, n) => (n === 1 ? new Promise(() => {}) : { data: { id: "em-2" }, error: null }) });
  const r = await sendWeekly({ ...common(o, stories), env: { ...ENV, NEWSLETTER_WEEKLY_SEND_TIMEOUT_MS: "30" }, resend, mode: "test", to: ["me@example.com"] });
  assert.equal(r.results[0].state, "accepted");
  const keys = resend.calls.filter((c) => c[0] === "emails.send").map((c) => c[1]);
  assert.equal(keys.length, 2);
  assert.equal(new Set(keys).size, 1);
  assert.ok(!keys[0].includes("me@example.com"));
  const h = shortHash(readState(o).contentHash);
  assert.match(keys[0], new RegExp(`^aimajung-weekly-test/${ID}/${h}/[0-9a-f]{16}$`)); // 같은 원고·같은 주소면 언제나 같은 키
});

t("API 키 · 비밀값 · 이메일 주소가 로그·기록·보고서에 남지 않음", async () => {
  const logs = [];
  const p = await approved(subscribers(3));
  const resend = mockResend({ members: subscribers(3) });
  await sendWeekly({ ...sendArgs(p, resend), log: (m) => logs.push(m) });
  await sendWeekly({ ...common(p.o, p.stories), resend: mockResend({}), mode: "test", to: ["private.person@example.com"], log: (m) => logs.push(m) }).catch((e) => logs.push(e.message));
  const e = await rejects(() => sendWeekly({ ...common(p.o, p.stories), resend: null, mode: "send", confirmArg: ID, hashArg: p.hash, expectRecipients: 3 }));
  logs.push(e.message);
  const files = [];
  const walk = (d) => {
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      if (f.isDirectory()) walk(path.join(d, f.name));
      else files.push(fs.readFileSync(path.join(d, f.name), "utf8"));
    }
  };
  walk(p.o.root);
  const all = [...logs, ...files].join("\n");
  assert.ok(!all.includes(FAKE_KEY) && !all.includes(FAKE_SECRET));
  for (let i = 0; i < 3; i++) assert.ok(!all.includes(`reader${i}@example.com`), `reader${i}`);
  assert.ok(!all.includes("private.person@example.com"));
  assert.equal(redact(`key ${FAKE_KEY} mail someone@example.com`, ENV), "key [가림] mail so***@example.com");
});

t("예약 준비에서 발송 API 호출 0회 · 발송 Secret 접근 없음", async () => {
  const calls = [];
  const stories = [0, 1, 2, 3].map((i) => fx(i));
  const o = tmp();
  await prepareWeekly({ id: ID, stories, config, env: { ...ENV }, fetchImpl: sitemapFetch(live(stories), calls), dir: o.dir, editionsDir: o.editionsDir, sentFile: o.sentFile });
  assert.deepEqual(calls, [`${SITE}/sitemap.xml`]);
  for (const f of ["weekly.mjs", "weekly-prepare.mjs"]) {
    const src = fs.readFileSync(path.join(ROOT, "scripts/newsletter", f), "utf8");
    assert.ok(!/from "resend"|weekly-delivery|emails\.send|broadcasts\./.test(src), f);
  }
  const y = fs.readFileSync(path.join(ROOT, "../.github/workflows/newsletter-weekly.yml"), "utf8");
  assert.match(y, /cron: "0 0 \* \* 0"/); // 일요일 00:00 UTC = 09:00 KST
  assert.ok(!/secrets\./.test(y), "준비 workflow에 secrets 참조");
  assert.ok(!/environment:/.test(y));
  assert.ok(!/newsletter:weekly:(send|approve)|newsletter:send|newsletter:test/.test(y));
  assert.ok(!/gh pr merge|--auto|vercel/.test(y));
  assert.match(y, /permissions:\s*\n\s*contents: write[^\n]*\n\s*pull-requests: write\s*\n\s*\n/);
  const s = fs.readFileSync(path.join(ROOT, "../.github/workflows/newsletter-send.yml"), "utf8");
  assert.ok(!/schedule:/.test(s), "발송 workflow에 예약 실행");
  assert.match(s, /environment: newsletter-send/);
  assert.match(s, /github\.ref_name == github\.event\.repository\.default_branch/);
  assert.ok(!/git push[^\n]*(--force|-f\b)/.test(s) && !/gh pr merge/.test(s));
  const d = fs.readFileSync(path.join(ROOT, "../.github/workflows/daily-editorial.yml"), "utf8");
  assert.ok(!/newsletter:|RESEND/.test(d), "DAILY workflow가 뉴스레터를 건드림");
});

t("기존 발송 명령으로 주간 호를 우회 발송할 수 없음 · 기존 편집 호 렌더링 유지", () => {
  const src = fs.readFileSync(path.join(ROOT, "scripts/newsletter/send.mjs"), "utf8");
  assert.match(src, /edition\?\.kind === "weekly"/);
  const e = loadEdition("2026-10-06");
  const m = renderEditionEmail(e, { mode: "broadcast", allStories: REAL, config });
  assert.ok(m.html.includes(`${SITE}/newsletters/2026-10-06/`) && m.html.includes("오늘의 흐름") && m.html.includes("🔥 오늘의 메인"));
  assert.ok(!m.html.includes("이번 주 메인"));
});

t("실제 데이터 기준 2026-10-11 호 미리 계산 (임시 폴더, 사이트맵은 실제 기사 목록으로 대체)", async () => {
  const o = tmp();
  const e = buildWeeklyEdition(ID, { main: null, more: [], readMore: [] }, PERIOD);
  assert.equal(e, null);
  const r = await prepareWeekly({ id: ID, stories: REAL, config, env: {}, production: { ok: true, slugs: live(REAL), url: "mock" }, dir: o.dir, editionsDir: path.join(ROOT, "newsletter/editions"), sentFile: o.sentFile });
  const used = r.state.selection.filter((x) => /이미 2026-10-06 호/.test(x.reasons.join()));
  assert.equal(used.length, 3);
  assert.ok(r.state.selection.some((x) => x.slug === "openai-models-codex-aws-ga" && /최신 소식 아님/.test(x.reasons.join())));
});

let pass = 0;
for (const { name, fn } of tests) {
  try {
    await fn();
    pass++;
    console.log(`  ok  ${name}`);
  } catch (e) {
    console.log(`  FAIL ${name}\n       ${e instanceof Stop ? "Stop: " : ""}${e.message}`);
  }
}
const protectedAfter = PROTECTED.map(sha);
const kept = protectedAfter.every((h, i) => h === protectedBefore[i]);
if (!kept) console.log("  FAIL 저장소 발송 기록·편집 호 파일이 바뀜");
const total = tests.length + 1;
const ok = pass + (kept ? 1 : 0);
console.log(ok === total ? `OK — 주간 뉴스레터 점검 ${ok}/${total} 통과` : `실패 — ${ok}/${total}`);
if (ok !== total) process.exitCode = 1;
