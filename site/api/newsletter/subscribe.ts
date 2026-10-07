import { Resend } from "resend";
import { createRateLimiter, createResendStore, handleSubscribe, resendSettings } from "../../src/lib/newsletterSubscribe.js";

/**
 * POST /api/newsletter/subscribe — AI마중 뉴스레터 구독 (Vercel Function)
 *
 * 사이트 본문은 정적 export(out/)이고, 이 파일만 서버에서 돈다.
 * RESEND_API_KEY, RESEND_AUDIENCE_ID(=Segment ID)는 Vercel Environment Variables에서만 읽는다.
 * 처리 규칙은 src/lib/newsletterSubscribe.ts 참고.
 */

const allow = createRateLimiter();
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
  const settings = resendSettings(process.env);
  const store = settings ? createResendStore(new Resend(settings.apiKey), settings.segmentId) : null;
  const ip = request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const result = await handleSubscribe(
    {
      body,
      ip,
      origin: request.headers.get("origin"),
      host: request.headers.get("x-forwarded-host") ?? request.headers.get("host"),
    },
    store,
    allow,
  );
  return new Response(JSON.stringify(result.body), { status: result.status, headers: JSON_HEADERS });
}

export function GET(): Response {
  return new Response(JSON.stringify({ ok: false, code: "bad_request" }), { status: 405, headers: { ...JSON_HEADERS, allow: "POST" } });
}
