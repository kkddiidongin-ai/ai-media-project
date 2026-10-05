import { categoryLabels } from "@/config/labels";
import type { StoryIndexItem } from "@/lib/indexTypes";
import { getStories } from "@/lib/news";

export const dynamic = "force-static";

/**
 * 검색·저장 목록용 정적 색인. 빌드 때 로컬 DB(content/stories)에서 만들어 /search-index.json으로 내보낸다.
 * 기사 본문과 원문 텍스트는 넣지 않는다.
 */
export function GET() {
  const items: StoryIndexItem[] = getStories().map((s) => ({
    slug: s.slug,
    title: s.title,
    summary: s.summary,
    eventDate: s.eventDate,
    categoryEn: categoryLabels[s.category].en,
    topics: s.topics,
    companies: s.companies,
    products: s.products,
    sourceName: s.sourceName,
  }));
  return Response.json(items);
}
