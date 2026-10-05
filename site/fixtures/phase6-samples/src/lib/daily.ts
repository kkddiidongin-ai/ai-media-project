import { siteConfig } from "@/config/site";
import { getArticles } from "./content";
import type { Article } from "./types";

/**
 * 데일리 피드 — publishedAt(발행일) 기준으로 글을 날짜별로 묶는다.
 * 확인일(checkedAt)이 아니라 발행일을 쓴다: 홈은 "그날 무엇이 올라왔는지"를 보여주는 곳이다.
 * 발행일이 없는 글은 피드에 넣지 않는다 (글 페이지·과제·검색에서는 계속 보인다).
 */

export interface DayGroup {
  /** YYYY-MM-DD */
  date: string;
  articles: Article[];
}

/** 같은 날 여러 편이면 id 역순(나중에 만든 글이 위)으로 둔다. */
function byPublished(a: Article, b: Article) {
  const d = (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "");
  if (d !== 0) return d;
  return b.id.localeCompare(a.id, "en", { numeric: true });
}

export function getFeed(): Article[] {
  return getArticles()
    .filter((a) => a.publishedAt)
    .sort(byPublished);
}

export function groupByDay(list: Article[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const a of list) {
    const date = a.publishedAt!.slice(0, 10);
    const last = groups.at(-1);
    if (last && last.date === date) last.articles.push(a);
    else groups.push({ date, articles: [a] });
  }
  return groups;
}

export function getDays(): DayGroup[] {
  return groupByDay(getFeed());
}

// ---------- 아카이브 페이지 나누기 ----------

export function archivePageCount(): number {
  return Math.max(1, Math.ceil(getDays().length / siteConfig.feed.archiveDaysPerPage));
}

export function getArchivePage(page: number): DayGroup[] {
  const per = siteConfig.feed.archiveDaysPerPage;
  return getDays().slice((page - 1) * per, page * per);
}

/** 특정 날짜가 들어 있는 아카이브 페이지 번호 */
export function archivePageOf(date: string): number {
  const idx = getDays().findIndex((d) => d.date === date);
  return idx < 0 ? 1 : Math.floor(idx / siteConfig.feed.archiveDaysPerPage) + 1;
}
