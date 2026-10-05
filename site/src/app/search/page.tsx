import { SearchClient } from "@/components/SearchClient";
import { PageHead, Wrap } from "@/components/ui";
import { categoryLabels } from "@/config/labels";
import { getTopics, topicCounts } from "@/lib/news";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "검색",
  description: "2026년 AI 기사를 회사·제품·주제·키워드로 찾습니다.",
  path: "/search/",
  noindex: true,
});

export default function SearchPage() {
  const quickTopics = topicCounts()
    .filter((t) => t.count > 0)
    .slice(0, 12)
    .map(({ topic }) => ({ slug: topic.slug, name: topic.name }));
  const aliasGroups = getTopics().map((t) => ({ slug: t.slug, names: [t.name, ...(t.aliases ?? [])] }));
  const categoryKo = Object.fromEntries(Object.values(categoryLabels).map((c) => [c.en, c.ko]));
  return (
    <Wrap>
      <PageHead kicker="전체에서 찾기" title="검색">
        <p>제목·요약·주제·회사·제품으로 기사를 찾습니다. 한글·영문 이름(오픈AI/OpenAI, 클로드/Claude, 제미나이/Gemini)은 같은 결과를 보여줍니다.</p>
      </PageHead>
      <SearchClient quickTopics={quickTopics} aliasGroups={aliasGroups} categoryKo={categoryKo} />
    </Wrap>
  );
}
