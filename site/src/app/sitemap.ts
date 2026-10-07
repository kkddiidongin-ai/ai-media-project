import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";
import { getCardnews, getCharts, getEditions, getIssues, getStories, storiesForTopic, getTopics } from "@/lib/news";

export const dynamic = "force-static";

/**
 * 실제 콘텐츠만 넣는다. DEMO 카드뉴스, COMING SOON(AI톡·AI강의·YouTube), 검색, 내가 모은 글,
 * 예전 주소 호환 페이지, 기록이 없는 주제 페이지는 넣지 않는다.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteConfig.url;
  const cards = getCardnews().filter((c) => !c.demo);
  const pages = ["/", "/newsletters/", "/newsletter/subscribe/", "/chart/", "/topics/", ...(cards.length ? ["/cardnews/"] : []), "/collab/", "/method/", "/about/"].map((p) => ({ url: `${base}${p}` }));
  const issues = getIssues().map((i) => ({ url: `${base}/newsletters/${i.date}/`, lastModified: i.stories.map((s) => s.updatedAt).sort().at(-1) }));
  // 메일로 발행한 편집 호 (같은 날짜의 날짜별 호와 겹치면 한 번만)
  const issueDates = new Set(getIssues().map((i) => i.date));
  const editions = getEditions()
    .filter((e) => !issueDates.has(e.id))
    .map((e) => ({ url: `${base}/newsletters/${e.id}/`, lastModified: e.id }));
  const stories = getStories().map((s) => ({ url: `${base}/stories/${s.slug}/`, lastModified: s.updatedAt }));
  const charts = getCharts().map((c) => ({ url: `${base}/chart/${c.slug}/`, lastModified: c.checkedAt }));
  const topics = getTopics()
    .filter((t) => storiesForTopic(t.slug).length > 0)
    .map((t) => ({ url: `${base}/topics/${t.slug}/`, lastModified: storiesForTopic(t.slug)[0].updatedAt }));
  const cardPages = cards.map((c) => ({ url: `${base}/cardnews/${c.slug}/`, lastModified: c.publishedAt }));
  return [...pages, ...editions, ...issues, ...stories, ...charts, ...topics, ...cardPages];
}
