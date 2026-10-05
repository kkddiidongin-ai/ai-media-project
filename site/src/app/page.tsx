import Link from "next/link";
import { ChartVisual } from "@/components/news/ChartView";
import { CategoryTag, StoryRow } from "@/components/news/Story";
import { DarkCard, PaperCard, SectionLabel, WideLink, Wrap } from "@/components/ui";
import { chartCategoryLabels } from "@/config/labels";
import { siteConfig } from "@/config/site";
import { getCharts, getIssues, topicCounts } from "@/lib/news";
import { chartHref, formatDate, formatShortDate, issueHref, storyHref, topicHref } from "@/lib/format";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({ path: "/" });

/**
 * 홈 (Phase 6.3): 오늘의 AI 뉴스레터 → 오늘 주요 story → AI차트 → 최근 AI 뉴스 → 지난 뉴스레터 → 주요 Topic.
 * 첫 화면 골격(라벨 → 카드 → 전체 보기)은 Phase 6.2-A에서 Reference 실측으로 맞춘 치수를 그대로 쓴다.
 */
export default function HomePage() {
  const issues = getIssues();
  const latest = issues[0];
  const charts = getCharts();
  const leadChart = charts.find((c) => c.type === "bar") ?? charts[0];
  const shownSlugs = new Set(latest?.stories.map((s) => s.slug));
  const recent = issues
    .slice(1)
    .flatMap((i) => i.stories)
    .filter((s) => !shownSlugs.has(s.slug))
    .slice(0, siteConfig.home.recentStories);
  const past = issues.slice(1, 1 + siteConfig.home.pastIssues);
  const topics = topicCounts().filter((t) => t.count > 0);

  return (
    <>
      <h1 className="sr-only">{siteConfig.name} — 최신 AI 뉴스레터</h1>

      {/* 브랜드 소개 한 줄: 왜 '마중'인지 (헤더의 브랜드명·메시지 바로 아래) */}
      <Wrap className="pt-[22px]">
        <p className="text-[14px] leading-[1.7] text-night-muted">
          <strong className="font-bold text-night-text">{siteConfig.descriptor}</strong> {siteConfig.intro}
        </p>
      </Wrap>

      {latest ? (
        <Wrap className="pt-[26px]">
          {/* 오늘의 AI 뉴스레터 */}
          <h2 className="mb-3 flex items-baseline gap-2 text-[11.5px] font-extrabold leading-5 tracking-[0.1em] text-night-accent">
            최신 AI 뉴스레터
            <time dateTime={latest.date} className="text-[12.5px] font-semibold tracking-normal text-night-muted">
              {formatShortDate(latest.date)}
            </time>
          </h2>

          <PaperCard className="relative max-h-[745px]">
            {/* 오늘의 주요 내용 */}
            <div className="border-b border-line bg-surface px-9 py-5 max-sm:px-5">
              <p className="mb-2.5 text-[11px] font-bold leading-[19px] tracking-[1px] text-muted">
                AI NEWSLETTER · {formatDate(latest.date)} · {latest.stories.length}건
              </p>
              <ol className="text-[13.5px] leading-[22px]">
                {(latest.stories.length >= 6 ? latest.stories.slice(0, 5) : latest.stories).map((s, i) => (
                  <li key={s.slug} className="grid min-h-[33px] grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-line py-1">
                    <span className="font-mono text-[12px] text-muted">{String(i + 1).padStart(2, "0")}</span>
                    <Link href={`${issueHref(latest.date)}#${s.slug}`} className="font-bold text-ink hover:underline hover:underline-offset-4">
                      {s.title}
                    </Link>
                    <span className="hidden sm:inline">
                      <CategoryTag category={s.category} tone="paper" />
                    </span>
                  </li>
                ))}
              </ol>
              {latest.stories.length >= 6 ? (
                <p className="mt-2 text-[12.5px] leading-[20px] text-ink-soft">
                  <Link href={`${issueHref(latest.date)}#issue-more`} className="font-semibold hover:underline hover:underline-offset-4">
                    MORE · 같은 날 다른 소식 {latest.stories.length - 5}건 짧게 보기 →
                  </Link>
                </p>
              ) : null}
              {latest.backfilled ? (
                <p className="mt-3 text-[11.5px] leading-[18px] text-muted">
                  이 호는 {formatDate(latest.compiledAt)}에 공식 원문을 확인해 정리했습니다.
                </p>
              ) : null}
            </div>

            {/* 오늘 주요 story */}
            <div className="px-9 py-[30px] max-sm:px-5">
              <div className="rounded-[6px] border border-line bg-surface px-6 py-5 max-sm:px-4">
                <h3 className="border-b border-line pb-3 text-[16px] font-bold leading-[26px] text-ink">오늘의 주요 story</h3>
                <ol className="mt-4 space-y-4">
                  {latest.stories.slice(0, 4).map((s, i) => (
                    <li key={s.slug} className="grid grid-cols-[1.75rem_minmax(0,1fr)] text-[14px] leading-[23.8px] tracking-[-0.2px]">
                      <span className="font-mono text-[12px] leading-[23.8px] text-muted">{String(i + 1).padStart(2, "0")}</span>
                      <p>
                        <Link href={storyHref(s.slug)} className="font-bold text-ink hover:underline hover:underline-offset-4">
                          {s.title}
                        </Link>{" "}
                        <span className="text-ink-soft">{s.summary}</span>
                      </p>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
            <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-[120px] bg-gradient-to-b from-paper/0 to-paper" />
          </PaperCard>
          <WideLink href={issueHref(latest.date)}>전체 보기 ↓</WideLink>
        </Wrap>
      ) : null}

      <Wrap className="mt-14 space-y-14">
        {/* AI차트 */}
        {leadChart ? (
          <section aria-labelledby="home-chart">
            <SectionLabel href="/chart/" more="AI차트 전체">
              <span id="home-chart">AI차트</span>
            </SectionLabel>
            <PaperCard>
              <div className="px-6 py-6 sm:px-9">
                <p className="text-[11px] font-extrabold tracking-[0.08em] text-accent">
                  {chartCategoryLabels[leadChart.category] ?? leadChart.category} · CHECKED {formatDate(leadChart.checkedAt)}
                </p>
                <h3 className="mt-1.5 text-[19px] font-bold leading-snug text-ink">
                  <Link href={chartHref(leadChart.slug)} className="hover:underline hover:underline-offset-4">
                    {leadChart.title}
                  </Link>
                </h3>
                <div className="mt-4">
                  <ChartVisual chart={leadChart} />
                </div>
              </div>
            </PaperCard>
            {charts.length > 1 ? <WideLink href="/chart/">{charts.length - 1}개 차트 더 보기</WideLink> : null}
          </section>
        ) : null}

        {/* 최근 AI 뉴스 */}
        {recent.length > 0 ? (
          <section aria-labelledby="home-recent">
            <SectionLabel href="/newsletters/" more="뉴스레터 전체">
              <span id="home-recent">최근 AI 뉴스</span>
            </SectionLabel>
            <DarkCard className="divide-y divide-night-line px-5">
              {recent.map((s) => (
                <StoryRow key={s.slug} s={s} />
              ))}
            </DarkCard>
          </section>
        ) : null}

        {/* 지난 뉴스레터 */}
        {past.length > 0 ? (
          <section aria-labelledby="home-past">
            <SectionLabel href="/newsletters/" more="전체 보기">
              <span id="home-past">지난 뉴스레터</span>
            </SectionLabel>
            <DarkCard className="divide-y divide-night-line">
              {past.map((issue) => (
                <div key={issue.date} className="px-5 py-4">
                  <Link href={issueHref(issue.date)} className="font-mono text-[12.5px] font-semibold text-night-muted hover:text-night-text">
                    {formatShortDate(issue.date)}
                  </Link>
                  <ul className="mt-2 space-y-1.5 border-l border-night-line pl-3">
                    {issue.stories.slice(0, 5).map((s) => (
                      <li key={s.slug} className="text-[14px] leading-snug">
                        <Link href={storyHref(s.slug)} className="text-night-text hover:underline hover:underline-offset-4">
                          {s.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </DarkCard>
          </section>
        ) : null}

        {/* 주요 Topic */}
        <section aria-labelledby="home-topics">
          <SectionLabel href="/topics/" more="주제별 전체">
            <span id="home-topics">주요 Topic</span>
          </SectionLabel>
          <ul className="flex flex-wrap gap-2">
            {topics.slice(0, 20).map(({ topic, count }) => (
              <li key={topic.slug}>
                <Link
                  href={topicHref(topic.slug)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-night-line bg-night-raise px-3 py-1.5 text-[13px] font-semibold text-night-text hover:border-night-muted"
                >
                  {topic.name}
                  <span className="font-mono text-[12px] text-night-accent">{count}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </Wrap>
    </>
  );
}
