import Link from "next/link";
import { StoryRow } from "@/components/news/Story";
import { Badge, DarkCard, PageHead, SectionLabel, Wrap } from "@/components/ui";
import { comingSoonLabel } from "@/config/labels";
import { getCardnews, getCharts, getStories, topicCounts } from "@/lib/news";
import { cardHref, chartHref, topicHref } from "@/lib/format";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "YouTube",
  description: "AI MEDIA 콘텐츠를 영상으로 확장하는 채널을 준비하고 있습니다.",
  path: "/youtube/",
  noindex: true,
});

/** Reference의 영상 확장. 다른 채널의 영상을 우리 콘텐츠처럼 채우지 않는다. */
export default function YoutubePage() {
  const plans = [
    { t: "짧은 영상", d: "그날의 뉴스레터에서 한 가지를 골라 1분 안에 설명합니다." },
    { t: "AI차트 해설", d: "차트 한 장을 화면에 띄우고 숫자가 무엇을 뜻하는지 짚습니다." },
    { t: "직접 해보기", d: "새 기능을 실제로 써보는 화면을 그대로 보여줍니다." },
  ];
  // 영상으로 다뤄볼 주제 후보: 최근 중요도 1 기사, 최신 차트, 기사가 많이 쌓인 주제, 최신 카드뉴스 (모두 읽을거리 링크)
  const stories = getStories().filter((s) => s.priority === 1).slice(0, 5);
  const charts = getCharts().slice(0, 3);
  const topics = topicCounts().slice(0, 6);
  const cards = getCardnews().slice(0, 3);
  return (
    <Wrap>
      <PageHead kicker="보면서 이해하는 AI" title="YouTube" badge={<Badge tone="amber">{comingSoonLabel}</Badge>}>
        <p>AI MEDIA 채널은 아직 열지 않았습니다. 다른 사람의 영상을 가져와 이 자리를 채우지 않습니다.</p>
      </PageHead>
      <section aria-labelledby="yt-plan">
        <SectionLabel>
          <span id="yt-plan">준비 중인 형식</span>
        </SectionLabel>
        <ul className="grid gap-3 sm:grid-cols-3">
          {plans.map((p) => (
            <li key={p.t} className="rounded-[10px] border border-night-line bg-night-raise px-5 py-4">
              <p className="font-bold text-night-text">{p.t}</p>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-night-muted">{p.d}</p>
            </li>
          ))}
        </ul>
      </section>
      <section className="mt-12" aria-labelledby="yt-ideas">
        <SectionLabel>
          <span id="yt-ideas">영상으로 다뤄볼 주제</span>
        </SectionLabel>
        <p className="mb-4 rounded-[8px] border border-dashed border-night-line px-4 py-3 text-[13px] leading-relaxed text-night-muted">
          아래는 <strong className="text-night-text">영상이 아니라 지금 읽을 수 있는 글</strong>입니다. 채널을 열면 먼저 다뤄볼 후보로, 최근 중요 기사·차트·카드뉴스·주제에서 자동으로 골랐습니다.
        </p>

        <h3 className="mb-2 text-[13px] font-bold text-night-text">최근 중요 기사 · 읽기</h3>
        <DarkCard className="divide-y divide-night-line px-5">
          {stories.map((s) => (
            <StoryRow key={s.slug} s={s} />
          ))}
        </DarkCard>

        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <div>
            <h3 className="mb-2 text-[13px] font-bold text-night-text">AI차트 · 읽기</h3>
            <ul className="space-y-2">
              {charts.map((c) => (
                <li key={c.slug}>
                  <Link href={chartHref(c.slug)} className="block rounded-[8px] border border-night-line bg-night-raise px-4 py-2.5 text-[14px] font-semibold leading-snug text-night-text hover:border-night-muted">
                    {c.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mb-2 text-[13px] font-bold text-night-text">카드뉴스 · 읽기</h3>
            <ul className="space-y-2">
              {cards.map((c) => (
                <li key={c.slug}>
                  <Link href={cardHref(c.slug)} className="block rounded-[8px] border border-night-line bg-night-raise px-4 py-2.5 text-[14px] font-semibold leading-snug text-night-text hover:border-night-muted">
                    {c.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <h3 className="mb-2 mt-6 text-[13px] font-bold text-night-text">기록이 많이 쌓인 주제 · 읽기</h3>
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

      <DarkCard className="mt-10 px-5 py-5 text-[13.5px] leading-relaxed text-night-muted">
        영상이 나오기 전까지는{" "}
        <Link href="/cardnews/" className="font-semibold text-night-accent underline underline-offset-4">
          카드뉴스
        </Link>
        와{" "}
        <Link href="/newsletters/" className="font-semibold text-night-accent underline underline-offset-4">
          뉴스레터
        </Link>
        로 같은 내용을 볼 수 있습니다.
      </DarkCard>
    </Wrap>
  );
}
