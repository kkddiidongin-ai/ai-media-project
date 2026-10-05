import Link from "next/link";
import { StoryRow } from "@/components/news/Story";
import { SavedList } from "@/components/news/SavedList";
import { DarkCard, PageHead, SectionLabel, Wrap } from "@/components/ui";
import { getCardnews, getStories, topicCounts } from "@/lib/news";
import { cardHref, topicHref } from "@/lib/format";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "내가 모은 글",
  description: "저장한 기사를 모아 봅니다. 이 브라우저에 저장됩니다.",
  path: "/saved/",
  noindex: true,
});

export default function SavedPage() {
  // 비어 있을 때 보여줄 다음 행동: 최근 기사 · 많이 쌓인 주제 · 카드뉴스 (서버에서 미리 만든다)
  const recent = getStories().slice(0, 5);
  const topics = topicCounts().slice(0, 10);
  const card = getCardnews()[0];
  const nextActions = (
    <div className="mt-10 space-y-10">
      <section aria-labelledby="saved-recent">
        <SectionLabel href="/newsletters/" more="뉴스레터 전체">
          <span id="saved-recent">최근 기사부터 저장해 보기</span>
        </SectionLabel>
        <DarkCard className="divide-y divide-night-line px-5">
          {recent.map((s) => (
            <StoryRow key={s.slug} s={s} />
          ))}
        </DarkCard>
      </section>
      <section aria-labelledby="saved-topics">
        <SectionLabel href="/topics/" more="주제별 전체">
          <span id="saved-topics">관심 주제에서 고르기</span>
        </SectionLabel>
        <ul className="flex flex-wrap gap-2">
          {topics.map(({ topic, count }) => (
            <li key={topic.slug}>
              <Link href={topicHref(topic.slug)} className="inline-flex items-center gap-1.5 rounded-full border border-night-line bg-night-raise px-3 py-1.5 text-[13px] font-semibold text-night-text hover:border-night-muted">
                {topic.name}
                <span className="font-mono text-[12px] text-night-accent">{count}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      {card ? (
        <p className="text-[14px] text-night-muted">
          흐름부터 보고 싶다면{" "}
          <Link href={cardHref(card.slug)} className="font-semibold text-night-accent underline underline-offset-4">
            카드뉴스 「{card.title}」 →
          </Link>
        </p>
      ) : null}
    </div>
  );

  return (
    <Wrap>
      <PageHead kicker="이 브라우저에 저장됩니다" title="내가 모은 글">
        <p>기사와 뉴스레터에서 &lsquo;저장&rsquo;을 누른 글이 여기 모입니다.</p>
      </PageHead>
      <SavedList nextActions={nextActions} />
      <p className="mt-8 border-t border-night-line pt-4 text-[13px] leading-relaxed text-night-muted">
        로그인이 없어서 <strong className="text-night-text">이 브라우저에 저장됩니다</strong>. 서버로 보내지 않습니다. 방문 기록을 지우거나 다른 기기·브라우저로 옮기면 목록이 사라집니다.
      </p>
    </Wrap>
  );
}
