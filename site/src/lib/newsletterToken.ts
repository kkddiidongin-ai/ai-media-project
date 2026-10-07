import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/**
 * 뉴스레터 구독 확인 토큰 (서버 전용, DB 없음)
 *
 * 형식: base64url( 버전(1) | IV(12) | 암호문 | 인증태그(16) ), AES-256-GCM
 * - 이메일·관심 분야·만료 시각을 암호화해 담는다 → 링크에 이메일이 읽히는 형태로 드러나지 않는다
 * - GCM 인증태그로 위변조를 막는다 (비밀값 없이는 유효한 토큰을 만들 수 없다)
 * - 키는 NEWSLETTER_CONFIRM_SECRET에서 HKDF로 만든다. 비밀값은 코드·저장소에 두지 않는다
 *
 * 한계: DB가 없으므로 '한 번만 사용'을 강제하지 않는다. 대신 만료 시간 안에서 같은 토큰을 다시 써도
 * 결과가 같도록(멱등) 확인 처리를 만든다.
 */

const VERSION = 1;
const IV_LEN = 12;
const TAG_LEN = 16;
const AAD = Buffer.from("aimajung-newsletter-confirm");
export const MIN_SECRET_LENGTH = 32;

export interface ConfirmPayload {
  email: string;
  interests: string[];
  /** 만료 시각 (ms) */
  expiresAt: number;
}

export type OpenResult = { ok: true; payload: ConfirmPayload } | { ok: false; reason: "invalid" | "expired" };

const keyFrom = (secret: string) => Buffer.from(hkdfSync("sha256", secret, "aimajung", "newsletter-confirm-v1", 32));

export function sealToken(payload: ConfirmPayload, secret: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(secret), iv);
  cipher.setAAD(AAD);
  const body = JSON.stringify({ e: payload.email, i: payload.interests, x: payload.expiresAt });
  const ct = Buffer.concat([cipher.update(body, "utf8"), cipher.final()]);
  return Buffer.concat([Buffer.from([VERSION]), iv, ct, cipher.getAuthTag()]).toString("base64url");
}

export function openToken(token: unknown, secret: string, now = Date.now()): OpenResult {
  if (typeof token !== "string" || token.length < 40 || token.length > 2048 || !/^[A-Za-z0-9_-]+$/.test(token)) return { ok: false, reason: "invalid" };
  const raw = Buffer.from(token, "base64url");
  if (raw.length < 1 + IV_LEN + TAG_LEN + 2 || raw[0] !== VERSION) return { ok: false, reason: "invalid" };
  let data: { e?: unknown; i?: unknown; x?: unknown };
  try {
    const decipher = createDecipheriv("aes-256-gcm", keyFrom(secret), raw.subarray(1, 1 + IV_LEN));
    decipher.setAAD(AAD);
    decipher.setAuthTag(raw.subarray(raw.length - TAG_LEN));
    const body = Buffer.concat([decipher.update(raw.subarray(1 + IV_LEN, raw.length - TAG_LEN)), decipher.final()]).toString("utf8");
    data = JSON.parse(body);
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (typeof data.e !== "string" || !Array.isArray(data.i) || typeof data.x !== "number") return { ok: false, reason: "invalid" };
  if (now > data.x) return { ok: false, reason: "expired" };
  return { ok: true, payload: { email: data.e, interests: data.i.filter((x): x is string => typeof x === "string"), expiresAt: data.x } };
}
