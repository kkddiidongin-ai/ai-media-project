import { Resend } from "resend";
import { createRateLimiter, createResendStore, handleConfirm, newsletterSettings } from "../../src/lib/newsletterSubscribe.js";

/**
 * POST /api/newsletter/confirm/ — 구독 확인 (Vercel Function)
 *
 * 확인 페이지(/newsletter/confirm/#token=…)가 토큰을 본문으로 보낸다. 토큰은 URL query로 받지 않는다
 * (서버 로그·Referer에 남지 않게). GET으로는 아무것도 처리하지 않는다 — 메일 보안 검사기의 링크 미리 열기로
 * 구독이 확정되지 않게 하기 위해서다.
 */

// 정상 사용자가 링크를 몇 번 눌러도 막히지 않을 만큼 넉넉하게 (무작위 토큰 대입은 암호화로 막힌다)
const allowIp = createRateLimiter(30, 10 * 60 * 1000);
const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const MAX_BODY = 4096;

export async function POST(request: Request): Promise<Response> {
  let body: unknown = null;
  const text = await request.text().catch(() => "");
  if (text.length <= MAX_BODY) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }
  const s = newsletterSettings(process.env);
  const result = await handleConfirm(
    {
      body,
      ip: request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown",
      origin: request.headers.get("origin"),
      host: request.headers.get("x-forwarded-host") ?? request.headers.get("host"),
    },
    { store: s ? createResendStore(new Resend(s.apiKey), s.segmentId) : null, secret: s?.secret ?? null, allowIp },
  );
  return new Response(JSON.stringify(result.body), { status: result.status, headers: JSON_HEADERS });
}

export function GET(): Response {
  return new Response(JSON.stringify({ ok: false, code: "bad_request" }), { status: 405, headers: { ...JSON_HEADERS, allow: "POST" } });
}
