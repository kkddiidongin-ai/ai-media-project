/**
 * AI마중 뉴스레터 설정 (구독 페이지 · 구독 API · 발송 스크립트가 함께 쓴다)
 *
 * 비밀값(RESEND_API_KEY)은 여기에 두지 않는다. .env.local(로컬)과 Vercel Environment Variables로만 넣는다.
 * 아래 null 항목은 운영자가 정해야 하는 값이다. 비어 있으면 실제 발송(newsletter:send)은 실패한다.
 * 같은 이름의 환경변수가 있으면 환경변수가 우선한다 (NEWSLETTER_FROM_EMAIL 등).
 *
 * 이 파일은 Node 스크립트(scripts/newsletter)에서도 직접 import하므로 다른 모듈을 import하지 않는다.
 */

export const newsletterConfig = {
  /** 발신자 이름 */
  newsletterFromName: "AI마중",
  /** 발신 주소 (Resend에서 인증한 aimajung.com). 구독 확인 메일과 뉴스레터에 쓴다. *.vercel.app 주소는 쓸 수 없다. env NEWSLETTER_FROM_EMAIL이 있으면 우선 */
  newsletterFromEmail: "letter@aimajung.com" as string | null,
  /**
   * 답장 받을 주소. 실제로 받아 볼 수 있는 받은편지함이 준비된 뒤에만 넣는다 (예정: hello@aimajung.com).
   * 비어 있으면 확인 메일은 Reply-To 없이 나가고, 정기 뉴스레터 발송(newsletter:send)은 멈춘다.
   * env NEWSLETTER_REPLY_TO
   */
  newsletterReplyTo: null as string | null,
  /** 구독 확인 링크 유효 시간 (시간) */
  confirmTokenTtlHours: 24,
  /**
   * 구독자를 담을 Resend Segment ID. 환경변수 이름은 운영 중인 RESEND_AUDIENCE_ID를 그대로 쓰지만 값은 Segment ID다
   * (Resend가 Audience를 Segment로 바꿨다. 지금은 Resend가 만든 'General' Segment). RESEND_SEGMENT_ID로 넣어도 된다
   */
  resendAudienceId: null as string | null,
  /** TODO(운영자): 메일 하단에 적을 발행인 정보 (상호·연락처 등). 임의로 채우지 않는다. env NEWSLETTER_OPERATOR_INFO */
  newsletterOperatorInfo: null as string | null,
  /** 구독자의 관심 분야를 저장할 Resend 연락처 속성 이름 (npm run newsletter:setup으로 만든다) */
  interestsPropertyKey: "interests",
} as const;

/** 구독 폼의 관심 분야 (key는 Resend 연락처 속성에 쉼표로 이어 저장) */
export const newsletterInterests = [
  { key: "ai-news", label: "AI 주요뉴스" },
  { key: "chatgpt-openai", label: "ChatGPT · OpenAI" },
  { key: "claude", label: "Claude" },
  { key: "gemini", label: "Gemini" },
  { key: "ai-work", label: "AI 업무활용" },
  { key: "ai-coding", label: "AI 코딩" },
  { key: "image-video", label: "이미지 · 영상" },
  { key: "ai-industry-policy", label: "AI 산업 · 정책" },
] as const;

export type NewsletterInterestKey = (typeof newsletterInterests)[number]["key"];

/** 개인정보 수집·이용 안내 (구독 페이지와 문서에서 같은 문장을 쓴다) */
export const newsletterPrivacy = {
  items: "이메일 주소, 선택한 관심 분야",
  purpose: "구독 확인 메일 및 AI마중 뉴스레터 발송, 관심 분야에 맞춘 콘텐츠 개선",
  retention: "구독을 해지할 때까지 보관합니다. 관계 법령에 따라 보관해야 하는 경우에는 그 기간 동안 보관합니다.",
  withdraw: "모든 메일 하단의 ‘수신거부’ 링크로 언제든 구독을 해지할 수 있습니다.",
  processor: "구독 정보는 이메일 발송 서비스 Resend에 저장됩니다.",
} as const;

/** 구독 결과 문구 (화면 표시용). API는 상태 코드만 돌려주고 문구는 화면이 고른다 */
export const newsletterMessages = {
  /** 신청 접수. 이미 구독 중인지 등 주소의 상태는 알려주지 않는다 (같은 문구) */
  confirmationSent: "확인 메일을 보냈습니다. 메일에서 구독 확인 버튼을 눌러 주시면 구독이 완료됩니다. 메일이 보이지 않으면 스팸함도 확인해 주세요.",
  error: "지금은 구독 신청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  invalidEmail: "이메일 주소 형식을 확인해 주세요.",
  consentRequired: "개인정보 수집·이용에 동의해야 구독할 수 있습니다.",
  rateLimited: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
} as const;

/** 구독 확인 페이지 결과 문구 */
export const confirmMessages = {
  checking: "구독을 확인하고 있습니다…",
  confirmed: "AI마중 뉴스레터 구독이 완료되었습니다. 다음 AI마중부터 이메일로 보내드릴게요.",
  alreadyConfirmed: "이미 구독이 확인된 이메일입니다. 다음 AI마중부터 이메일로 보내드릴게요.",
  expired: "확인 링크가 만료되었습니다. 구독 페이지에서 다시 신청해 주세요.",
  invalid: "확인 링크가 올바르지 않습니다. 받은 메일의 버튼을 다시 눌러 주시거나, 구독 페이지에서 다시 신청해 주세요.",
  error: "지금은 구독을 확인하지 못했습니다. 잠시 후 이 페이지를 새로고침해 주세요.",
  rateLimited: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
} as const;

/** 구독 확인 페이지 (토큰은 #token= 조각으로 전달 — 서버 로그·Referer에 남지 않는다) */
export const CONFIRM_PAGE_PATH = "/newsletter/confirm/";
/** 구독 확인 API 경로 (Vercel Function: site/api/newsletter/confirm.ts) */
export const CONFIRM_ENDPOINT = "/api/newsletter/confirm/";

/** 구독 API 경로 (Vercel Function: site/api/newsletter/subscribe.ts). trailingSlash 설정 때문에 끝에 / 를 붙인다 (없으면 308 한 번 더) */
export const SUBSCRIBE_ENDPOINT = "/api/newsletter/subscribe/";

/** 이메일 주소 검사 (화면·API 공통). 엄격한 RFC 검사 대신 흔한 오입력을 거른다 */
export function normalizeEmail(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const email = input.trim().toLowerCase();
  if (email.length < 6 || email.length > 254) return null;
  if (!/^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(email)) return null;
  if (email.includes("..")) return null;
  return email;
}
