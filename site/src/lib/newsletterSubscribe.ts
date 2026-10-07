import { createHash } from "node:crypto";
import type { Resend } from "resend";
import { newsletterConfig, newsletterInterests, normalizeEmail } from "../config/newsletter.js";

/**
 * 뉴스레터 구독 처리 (서버 전용). Vercel Function(api/newsletter/subscribe.ts)이 부른다.
 * 저장소(Resend)는 ContactStore로 넘겨받으므로 테스트에서는 가짜 저장소를 쓴다.
 *
 * 응답에는 상태 코드(code)만 담는다. 저장소 이름·오류 원문·API 키 같은 내부 정보는 응답과 로그에 남기지 않는다.
 * 로그에는 이메일 전체 대신 해시 앞 10자리만 적는다.
 */

export type SubscribeCode =
  | "subscribed"
  | "duplicate"
  | "invalid_email"
  | "consent_required"
  | "bad_request"
  | "forbidden"
  | "rate_limited"
  | "unavailable"
  | "error";

export interface SubscribeResult {
  status: number;
  body: { ok: boolean; code: SubscribeCode };
}

export interface ContactLookup {
  exists: boolean;
  unsubscribed: boolean;
  inSegment: boolean;
}

export interface ContactStore {
  find(email: string): Promise<ContactLookup>;
  create(email: string, interests: string[]): Promise<void>;
  resubscribe(email: string, interests: string[], inSegment: boolean): Promise<void>;
}

export interface SubscribeRequest {
  body: unknown;
  ip: string;
  origin: string | null;
  host: string | null;
}

const reply = (status: number, code: SubscribeCode): SubscribeResult => ({ status, body: { ok: status < 300, code } });
const INTEREST_KEYS = new Set<string>(newsletterInterests.map((i) => i.key));

export const emailHash = (email: string) => createHash("sha256").update(email).digest("hex").slice(0, 10);

/** 인스턴스 메모리 기반 요청 제한 (IP당 windowMs 동안 limit회). 인스턴스가 여러 개면 각자 센다 — 1차 방어용 */
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

type Log = (event: Record<string, string>) => void;
const defaultLog: Log = (event) => console.info(JSON.stringify({ evt: "newsletter_subscribe", ...event }));

export async function handleSubscribe(
  req: SubscribeRequest,
  store: ContactStore | null,
  allow: (key: string) => boolean,
  log: Log = defaultLog,
): Promise<SubscribeResult> {
  // 다른 사이트에서 보낸 요청 거부 (Origin이 있을 때만 비교)
  if (req.origin && req.host) {
    let originHost = "";
    try {
      originHost = new URL(req.origin).host;
    } catch {
      /* 잘못된 Origin */
    }
    if (originHost !== req.host) return reply(403, "forbidden");
  }
  if (!allow(req.ip)) {
    log({ result: "rate_limited" });
    return reply(429, "rate_limited");
  }
  if (typeof req.body !== "object" || req.body === null || Array.isArray(req.body)) return reply(400, "bad_request");
  const body = req.body as Record<string, unknown>;

  // 허니팟: 사람에게는 보이지 않는 칸. 채워져 있으면 저장하지 않고 성공처럼 답한다 (봇에게 단서를 주지 않기 위해)
  if (typeof body.website === "string" && body.website.trim() !== "") {
    log({ result: "honeypot" });
    return reply(200, "subscribed");
  }

  const email = normalizeEmail(body.email);
  if (!email) return reply(400, "invalid_email");
  if (body.consent !== true) return reply(400, "consent_required");
  const rawInterests = Array.isArray(body.interests) ? body.interests : [];
  if (rawInterests.length > INTEREST_KEYS.size) return reply(400, "bad_request");
  const interests = [...new Set(rawInterests.filter((x): x is string => typeof x === "string" && INTEREST_KEYS.has(x)))];

  if (!store) {
    // API 키·Segment ID가 설정되지 않았다. 가짜 성공으로 처리하지 않는다
    log({ result: "not_configured" });
    return reply(503, "unavailable");
  }

  const h = emailHash(email);
  try {
    const found = await store.find(email);
    if (found.exists && !found.unsubscribed && found.inSegment) {
      log({ result: "duplicate", email: h });
      return reply(409, "duplicate");
    }
    if (found.exists) await store.resubscribe(email, interests, found.inSegment);
    else await store.create(email, interests);
    log({ result: found.exists ? "resubscribed" : "subscribed", email: h });
    return reply(200, "subscribed");
  } catch (e) {
    log({ result: "error", email: h, reason: e instanceof StoreError ? e.reason : "unexpected" });
    return reply(502, "error");
  }
}

/** 저장소 오류: reason에는 Resend 오류 이름(validation_error 등)만 담는다 (메시지 원문은 이메일을 포함할 수 있어 버린다) */
export class StoreError extends Error {
  constructor(public reason: string) {
    super(reason);
  }
}

/** 환경변수에서 Resend 설정을 읽는다. 하나라도 없으면 null */
export function resendSettings(env: Record<string, string | undefined>) {
  const apiKey = env.RESEND_API_KEY?.trim();
  const segmentId = (env.RESEND_SEGMENT_ID || env.RESEND_AUDIENCE_ID || newsletterConfig.resendAudienceId || "").trim();
  if (!apiKey || !segmentId) return null;
  return { apiKey, segmentId };
}

/** Resend 연락처(Contacts) + Segment를 쓰는 저장소 */
export function createResendStore(resend: Resend, segmentId: string): ContactStore {
  const key = newsletterConfig.interestsPropertyKey;
  const check = (error: { name: string } | null) => {
    if (error) throw new StoreError(error.name);
  };
  return {
    async find(email) {
      const { data, error } = await resend.contacts.get({ email });
      if (error?.name === "not_found") return { exists: false, unsubscribed: false, inSegment: false };
      check(error);
      const seg = await resend.contacts.segments.list({ email });
      check(seg.error);
      return { exists: true, unsubscribed: Boolean(data?.unsubscribed), inSegment: Boolean(seg.data?.data.some((s) => s.id === segmentId)) };
    },
    async create(email, interests) {
      const { error } = await resend.contacts.create({
        email,
        unsubscribed: false,
        properties: { [key]: interests.join(",") },
        segments: [{ id: segmentId }],
      });
      check(error);
    },
    async resubscribe(email, interests, inSegment) {
      const { error } = await resend.contacts.update({ email, unsubscribed: false, properties: { [key]: interests.join(",") } });
      check(error);
      if (!inSegment) check((await resend.contacts.segments.add({ email, segmentId })).error);
    },
  };
}
