import { siteConfig } from "@/config/site";
import { getStories } from "@/lib/news";

export const dynamic = "force-static";

const LIMIT = 50;

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

// publishedAt(실제 발행일, YYYY-MM-DD)을 한국 시간 자정 기준 RFC 822 날짜로 — 사건일(eventDate)은 쓰지 않는다
const rfc822 = (d: string) => new Date(`${d}T00:00:00+09:00`).toUTCString();

/** 네이버·구글 등록용 RSS 2.0 — 빌드할 때마다 발행 기사에서 다시 만든다 */
export function GET() {
  const base = siteConfig.url;
  const stories = getStories()
    .filter((s) => s.status === "published")
    .map((s, i) => ({ s, i }))
    .sort((a, b) => b.s.publishedAt.localeCompare(a.s.publishedAt) || a.i - b.i)
    .slice(0, LIMIT)
    .map(({ s }) => s);
  const items = stories
    .map((s) => {
      const url = `${base}/stories/${s.slug}/`;
      return `    <item>
      <title>${esc(s.title)}</title>
      <link>${esc(url)}</link>
      <guid isPermaLink="true">${esc(url)}</guid>
      <pubDate>${rfc822(s.publishedAt)}</pubDate>
      <description>${esc(s.summary)}</description>
    </item>`;
    })
    .join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(siteConfig.name)}</title>
    <link>${base}/</link>
    <description>${esc(siteConfig.description)}</description>
    <language>ko</language>
    <atom:link href="${base}/rss.xml" rel="self" type="application/rss+xml"/>
    ${stories[0] ? `<lastBuildDate>${rfc822(stories[0].publishedAt)}</lastBuildDate>` : ""}
${items}
  </channel>
</rss>
`;
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
}
