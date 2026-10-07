import { createHash } from "node:crypto";
import type { Resend } from "resend";
import { newsletterConfig, newsletterInterests, normalizeEmail, CONFIRM_PAGE_PATH } from "../config/newsletter.js";
import { siteConfig } from "../config/site.js";
import { renderConfirmEmail } from "./newsletterConfirmEmail.js";
import { MIN_SECRET_LENGTH, openToken, sealToken } from "./newsletterToken.js";

/**
 * 뉴스레터 구독 (서버 전용, 이중 확인 double opt-in)
 *
 * 1) 신청 handleSubscribe: 입력 검사 → 암호화 토큰 발급 → 확인 메일 발송. 이 단계에서는 Resend 연락처를 만들지 않는다.
 *    이미 구독 중인지도 조회하지 않는다 (주소 존재 여부를 응답으로 드러내지 않고, 이메일이 든 URL 조회도 없앤다).
 * 2) 확인 handleConfirm: 토큰 검증(위변조·만료) → 연락처 생성/갱신(unsubscribed:false, interests, General Segment).
 *
 * 이메일 주소는 Resend 요청 URL(path·query)에 넣지 않는다. 생성은 POST /contacts 본문으로 보내고,
 * 그 뒤의 조회·수정·Segment 등록은 모두 연락처 id로 한다. 로그에는 이메일 해시 앞 10자리만 남긴다.
 * 응답에는 상태 code만 담는다 (Resend 이름·오류 원문·키 같은 내부 정보 없음).
 */

export type SubscribeCode = "confirmation_sent" | "invalid_email" | "consent_required" | "bad_request" | "forbidden" | "rate_limited" | "unavailable" | "error";
export type ConfirmCode = "confirmed" | "already_confirmed" | "expired" | "invalid" | "bad_request" | "forbidden" | "rate_limited" | "unavailable" | "error";

export interface ApiResult<C extends string> {
  status: number;
  body: { ok: boolean; code: C };
}

export interface ApiRequest {
  body: unknown;
  ip: string;
  origin: string | null;
  host: string | null;
}

/** 확인 메일 보내기 */
export interface Mailer {
  sendConfirmation(email: string, confirmUrl: string): Promise<void>;
}

/** 확인된 구독자를 Resend에 반영. 'already'는 이미 구독 중이던 연락처 */
export interface ContactStore {
  confirm(email: string, interests: string[]): Promise<"subscribed" | "already">;
}

type Log = (event: Record<string, string>) => void;
const defaultLog: Log = (event) => console.info(JSON.stringify({ evt: "newsletter", ...event }));

const reply = <C extends string>(status: number, code: C): ApiResult<C> => ({ status, body: { ok: status < 300, code } });
const INTEREST_KEYS = new Set<string>(newsletterInterests.map((i) => i.key));
export const emailHash = (email: string) => createHash("sha256").update(email).digest("hex").slice(0, 10);

/** 인스턴스 메모리 기반 요청 제한 (key당 windowMs 동안 limit회). 인스턴스가 여러 개면 각자 센다 — 1차 방어용 */
export function createRateLimiter(limit = 5, windowMs = 10 * 60 * 1000) {
  const hits = new Map<string, number[]>();
  return (key: string, now = Date.now()) => {
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 5000) for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k);
    return recent.length <= limit;
  };
}

/** 다른 사이트에서 보낸 요청인지 (Origin이 있을 때만 비교) */
function crossOrigin(req: ApiRequest) {
  if (!req.origin || !req.host) return false;
  try {
    return new URL(req.origin).host !== req.host;
  } catch {
    return true;
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

// ---------- 1) 신청 ----------

export interface SubscribeContext {
  mailer: Mailer | null;
  secret: string | null;
  allowIp: (key: string) => boolean;
  /** 같은 주소로 확인 메일을 너무 자주 보내지 않게 (메일 폭탄 방지) */
  allowEmail: (key: string) => boolean;
  now?: number;
  log?: Log;
}

export async function handleSubscribe(req: ApiRequest, ctx: SubscribeContext): Promise<ApiResult<SubscribeCode>> {
  const log = ctx.log ?? defaultLog;
  const now = ctx.now ?? Date.now();
  if (crossOrigin(req)) return reply(403, "forbidden");
  if (!ctx.allowIp(req.ip)) {
    log({ step: "subscribe", result: "rate_limited" });
    return reply(429, "rate_limited");
  }
  if (!isObject(req.body)) return reply(400, "bad_request");
  const body = req.body;

  // 허니팟: 사람에게는 보이지 않는 칸. 채워져 있으면 아무것도 보내지 않고 정상 응답과 같게 답한다
  if (typeof body.website === "string" && body.website.trim() !== "") {
    log({ step: "subscribe", result: "honeypot" });
    return reply(200, "confirmation_sent");
  }

  const email = normalizeEmail(body.email);
  if (!email) return reply(400, "invalid_email");
  if (body.consent !== true) return reply(400, "consent_required");
  const rawInterests = Array.isArray(body.interests) ? body.interests : [];
  if (rawInterests.length > INTEREST_KEYS.size) return reply(400, "bad_request");
  const interests = [...new Set(rawInterests.filter((x): x is string => typeof x === "string" && INTEREST_KEYS.has(x)))];

  if (!ctx.mailer || !ctx.secret) {
    // 설정이 빠졌다. 가짜 성공으로 처리하지 않는다
    log({ step: "subscribe", result: "not_configured" });
    return reply(503, "unavailable");
  }

  const h = emailHash(email);
  // 같은 주소로 짧은 시간에 여러 번 신청하면 메일을 더 보내지 않지만, 응답은 같게 해 주소 상태를 드러내지 않는다
  if (!ctx.allowEmail(h)) {
    log({ step: "subscribe", result: "email_throttled", email: h });
    return reply(200, "confirmation_sent");
  }
  const token = sealToken({ email, interests, expiresAt: now + newsletterConfig.confirmTokenTtlHours * 3600_000 }, ctx.secret);
  const confirmUrl = `${siteConfig.url.replace(/\/$/, "")}${CONFIRM_PAGE_PATH}#token=${token}`;
  try {
    await ctx.mailer.sendConfirmation(email, confirmUrl);
    log({ step: "subscribe", result: "confirmation_sent", email: h });
    return reply(200, "confirmation_sent");
  } catch (e) {
    log({ step: "subscribe", result: "error", email: h, reason: e instanceof StoreError ? e.reason : "unexpected" });
    return reply(502, "error");
  }
}

// ---------- 2) 확인 ----------

export interface ConfirmContext {
  store: ContactStore | null;
  secret: string | null;
  allowIp: (key: string) => boolean;
  now?: number;
  log?: Log;
}

export async function handleConfirm(req: ApiRequest, ctx: ConfirmContext): Promise<ApiResult<ConfirmCode>> {
  const log = ctx.log ?? defaultLog;
  if (crossOrigin(req)) return reply(403, "forbidden");
  if (!ctx.allowIp(req.ip)) {
    log({ step: "confirm", result: "rate_limited" });
    return reply(429, "rate_limited");
  }
  if (!isObject(req.body)) return reply(400, "bad_request");
  if (!ctx.store || !ctx.secret) {
    log({ step: "confirm", result: "not_configured" });
    return reply(503, "unavailable");
  }
  const opened = openToken(req.body.token, ctx.secret, ctx.now ?? Date.now());
  if (!opened.ok) {
    log({ step: "confirm", result: opened.reason });
    return opened.reason === "expired" ? reply(410, "expired") : reply(400, "invalid");
  }
  const email = normalizeEmail(opened.payload.email);
  if (!email) return reply(400, "invalid");
  const interests = opened.payload.interests.filter((x) => INTEREST_KEYS.has(x));
  const h = emailHash(email);
  try {
    const result = await ctx.store.confirm(email, interests);
    log({ step: "confirm", result, email: h });
    return result === "already" ? reply(200, "already_confirmed") : reply(200, "confirmed");
  } catch (e) {
    log({ step: "confirm", result: "error", email: h, reason: e instanceof StoreError ? e.reason : "unexpected" });
    return reply(502, "error");
  }
}

// ---------- 설정 · Resend 연결 ----------

/** 저장소 오류: reason에는 Resend 오류 이름(validation_error 등)만 담는다 (메시지 원문은 이메일을 포함할 수 있어 버린다) */
export class StoreError extends Error {
  constructor(public reason: string) {
    super(reason);
  }
}

export interface NewsletterSettings {
  apiKey: string;
  segmentId: string;
  secret: string;
  from: string;
  replyTo?: string;
}

/** 환경변수(+설정 파일)에서 구독에 필요한 값을 읽는다. 하나라도 없으면 null (값은 출력하지 않는다) */
export function newsletterSettings(env: Record<string, string | undefined>): NewsletterSettings | null {
  const apiKey = env.RESEND_API_KEY?.trim();
  const segmentId = (env.RESEND_SEGMENT_ID || env.RESEND_AUDIENCE_ID || newsletterConfig.resendAudienceId || "").trim();
  const secret = env.NEWSLETTER_CONFIRM_SECRET?.trim() ?? "";
  const fromEmail = (env.NEWSLETTER_FROM_EMAIL || newsletterConfig.newsletterFromEmail || "").trim();
  const replyTo = (env.NEWSLETTER_REPLY_TO || newsletterConfig.newsletterReplyTo || "").trim();
  if (!apiKey || !segmentId || secret.length < MIN_SECRET_LENGTH || !fromEmail || /@(.+\.)?vercel\.app$/i.test(fromEmail)) return null;
  const fromName = env.NEWSLETTER_FROM_NAME || newsletterConfig.newsletterFromName;
  return { apiKey, segmentId, secret, from: `${fromName} <${fromEmail}>`, replyTo: replyTo || undefined };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
type SdkResult<T> = { data: T | null; error: { name: string } | null };

/** Resend 호출. 요청 한도(rate_limit_exceeded)에 걸리면 잠깐 쉬고 다시 (최대 3번) */
async function call<T>(fn: () => Promise<SdkResult<T>>, retryDelayMs: number): Promise<SdkResult<T>> {
  for (let i = 0; ; i++) {
    const r = await fn();
    if (r.error?.name !== "rate_limit_exceeded" || i >= 3) return r;
    await wait(retryDelayMs * (i + 1));
  }
}

/** Resend 이메일 발송 (구독 확인 메일). 이메일은 요청 본문에만 들어간다 */
export function createResendMailer(resend: Resend, s: Pick<NewsletterSettings, "from" | "replyTo">, retryDelayMs = 1100): Mailer {
  return {
    async sendConfirmation(email, confirmUrl) {
      const mail = renderConfirmEmail(confirmUrl, newsletterConfig.confirmTokenTtlHours);
      const r = await call(() => resend.emails.send({ from: s.from, to: [email], replyTo: s.replyTo, subject: mail.subject, html: mail.html, text: mail.text }), retryDelayMs);
      if (r.error) throw new StoreError(r.error.name);
    },
  };
}

const SCAN_PAGE = 100;
const SCAN_MAX_PAGES = 100; // 최대 1만 명까지 훑는다. 넘으면 오류로 처리하고 문서의 확장 방안을 따른다
const FRESH_MS = 5 * 60 * 1000;

/**
 * Resend 연락처 + Segment 저장소 (확인 단계에서만 쓴다)
 *
 * 1. POST /contacts {email, unsubscribed:false, properties, segments:[{id}]} — 이메일은 본문에만
 * 2. 성공해 id를 받으면 GET /contacts/{id}로 상태를 본다. 방금(5분 안) 만들어진 연락처면 끝.
 *    오래된 연락처(=원래 있던 주소)면 아래 3을 한다.
 * 2'. 생성이 실패하면(이미 있는 주소 등) 연락처 목록(GET /contacts?limit=100&after=…)을 넘기며 id를 찾는다.
 *    찾지 못하면 원래 오류로 실패 처리한다.
 * 3. 원래 있던 연락처: PATCH /contacts/{id} {unsubscribed:false, properties} + Segment에 없으면
 *    POST /contacts/{id}/segments/{segmentId}. 이미 구독 중이었으면 'already'.
 * 같은 토큰을 여러 번 써도 결과가 같다 (중복 연락처·중복 Segment 등록 없음).
 */
export function createResendStore(resend: Resend, segmentId: string, opts: { retryDelayMs?: number; now?: () => number } = {}): ContactStore {
  const key = newsletterConfig.interestsPropertyKey;
  const delay = opts.retryDelayMs ?? 1100;
  const now = opts.now ?? Date.now;
  const fail = (error: { name: string } | null) => {
    if (error) throw new StoreError(error.name);
  };

  async function findIdByScan(email: string): Promise<string | null> {
    let after: string | undefined;
    for (let page = 0; page < SCAN_MAX_PAGES; page++) {
      const r = await call(() => resend.contacts.list(after ? { limit: SCAN_PAGE, after } : { limit: SCAN_PAGE }), delay);
      fail(r.error);
      const list = r.data?.data ?? [];
      const hit = list.find((c) => c.email.toLowerCase() === email);
      if (hit) return hit.id;
      if (!r.data?.has_more || list.length === 0) return null;
      after = list[list.length - 1].id;
    }
    throw new StoreError("scan_limit");
  }

  return {
    async confirm(email, interests) {
      const properties = { [key]: interests.join(",") };
      const created = await call(() => resend.contacts.create({ email, unsubscribed: false, properties, segments: [{ id: segmentId }] }), delay);
      let id = created.data?.id ?? null;
      if (!id) {
        id = await findIdByScan(email);
        if (!id) throw new StoreError(created.error?.name ?? "unexpected");
      }
      const contactId = id;
      const current = await call(() => resend.contacts.get(contactId), delay);
      fail(current.error);
      const createdAt = Date.parse(current.data?.created_at ?? "");
      if (created.data?.id && Number.isFinite(createdAt) && now() - createdAt < FRESH_MS) return "subscribed";

      // 원래 있던 연락처: 구독 상태·관심 분야·Segment를 확인 내용대로 맞춘다
      const segs = await call(() => resend.contacts.segments.list({ contactId }), delay);
      fail(segs.error);
      const inSegment = Boolean(segs.data?.data.some((s) => s.id === segmentId));
      const wasActive = current.data?.unsubscribed === false && inSegment;
      const upd = await call(() => resend.contacts.update({ id: contactId, unsubscribed: false, properties }), delay);
      fail(upd.error);
      if (!inSegment) fail((await call(() => resend.contacts.segments.add({ contactId, segmentId }), delay)).error);
      return wasActive ? "already" : "subscribed";
    },
  };
}
