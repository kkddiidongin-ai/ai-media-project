import { weekdayLabels } from "@/config/labels";

/** 2026-10-03 → 2026.10.03 */
export function formatDate(d?: string | null): string {
  if (!d) return "";
  const [y, m, day] = d.slice(0, 10).split("-");
  return day ? `${y}.${m}.${day}` : d;
}

/** 2026-10-03 → 10.03 */
export function formatShortDate(d?: string | null): string {
  if (!d) return "";
  const [, m, day] = d.slice(0, 10).split("-");
  return day ? `${m}.${day}` : d;
}

/** 요일 (시간대 영향 없게 UTC로 해석) */
export function weekday(d: string): string {
  return weekdayLabels[new Date(`${d.slice(0, 10)}T00:00:00Z`).getUTCDay()];
}

/** 2026-10-03 → 2026년 10월 3일 (토) */
export function formatLongDate(d: string): string {
  const [y, m, day] = d.slice(0, 10).split("-");
  return `${y}년 ${Number(m)}월 ${Number(day)}일 (${weekday(d)})`;
}

/** 2026-10 → 2026년 10월 */
export function formatMonth(ym: string): string {
  const [y, m] = ym.split("-");
  return `${y}년 ${Number(m)}월`;
}

export const storyHref = (slug: string) => `/stories/${slug}/`;
export const issueHref = (date: string) => `/newsletters/${date.slice(0, 10)}/`;
export const topicHref = (slug: string) => `/topics/${slug}/`;
export const chartHref = (slug: string) => `/chart/${slug}/`;
export const cardHref = (slug: string) => `/cardnews/${slug}/`;

/** 원문 주소에서 도메인만 */
export function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}
