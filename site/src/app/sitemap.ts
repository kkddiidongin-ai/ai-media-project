import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";
import { getCardnews, getCharts, getIssues, getStories, storiesForTopic, getTopics } from "@/lib/news";

export const dynamic = "force-static";

/**
 * 실제 콘텐츠만 넣는다. DEMO 카드뉴스, COMING SOON(AI톡·AI강의·YouTube), 검색, 내가 모은 글,
 * 예전 주소 호환 페이지, 기록이 없는 주제 페이지는 넣지 않는다.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteConfig.url;
  const cards = getCardnews().filter((c) => !c.demo);
  const pages = ["/", "/newsletters/", "/chart/", "/topics/", ...(cards.length ? ["/cardnews/"] : []), "/collab/", "/method/", "/about/"].map((p) => ({ url: `${base}${p}` }));
  const issues = getIssues().map((i) => ({ url: `${base}/newsletters/${i.date}/`, lastModified: i.stories.map((s) => s.updatedAt).sort().at(-1) }));
  const stories = getStories().map((s) => ({ url: `${base}/stories/${s.slug}/`, lastModified: s.updatedAt }));
  const charts = getCharts().map((c) => ({ url: `${base}/chart/${c.slug}/`, lastModified: c.checkedAt }));
  const topics = getTopics()
    .filter((t) => storiesForTopic(t.slug).length > 0)
    .map((t) => ({ url: `${base}/topics/${t.slug}/`, lastModified: storiesForTopic(t.slug)[0].updatedAt }));
  const cardPages = cards.map((c) => ({ url: `${base}/cardnews/${c.slug}/`, lastModified: c.publishedAt }));
  return [...pages, ...issues, ...stories, ...charts, ...topics, ...cardPages];
}
