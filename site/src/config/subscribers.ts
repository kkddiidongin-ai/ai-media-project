/**
 * 홈 '구독자 수' 카드 설정
 *
 * value는 사람이 넣은 지정값이다. Resend 연락처 집계와 연결하지 않았다 (실제 집계 전환은 운영자가 따로 요청할 때만).
 * verified가 false인 값은 확인된 구독자 수가 아니므로 운영 사이트(production build)에는 표시하지 않는다.
 * 개발 미리보기에서만 보인다:
 *   - `npm run dev` (NODE_ENV=development)
 *   - 또는 빌드할 때 AIMAJUNG_SUBSCRIBER_PREVIEW=true (미리보기용 빌드)
 * 실제 집계로 확인한 값을 넣을 때만 verified를 true로 바꾼다.
 */
export const subscriberCountConfig = {
  /** 표시할 구독자 수 (지정값) */
  value: 187632,
  /** 실제 집계로 확인한 값인지. 확인 전에는 false — 운영 사이트에 표시하지 않는다 */
  verified: false as boolean,
  /** 값의 출처 */
  source: "manual" as "manual" | "resend",
} as const;

/** 지금 빌드에서 카드를 보여도 되는지 (확인된 값이거나 개발 미리보기일 때만) */
export function subscriberCountForDisplay(env: Record<string, string | undefined> = process.env): number | null {
  const { value, verified } = subscriberCountConfig;
  if (!Number.isInteger(value) || value < 0) return null;
  const preview = env.NODE_ENV === "development" || env.AIMAJUNG_SUBSCRIBER_PREVIEW === "true";
  return verified || preview ? value : null;
}

/** 187632 → "187,632" */
export const formatSubscriberCount = (n: number) => n.toLocaleString("ko-KR");
