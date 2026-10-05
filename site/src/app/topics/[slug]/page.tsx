import Link from "next/link";
import { notFound } from "next/navigation";
import { StoryRow } from "@/components/news/Story";
import { DarkCard, EmptyState, PageHead, SectionLabel, Wrap } from "@/components/ui";
import { topicKindLabels } from "@/config/labels";
import { getCardnews, getCharts, getTopic, getTopics, keyChanges, relatedTopics, starterStories, storiesForTopic } from "@/lib/news";
import { cardHref, chartHref, formatDate, formatMonth, issueHref, storyHref, topicHref } from "@/lib/format";
import { pageMetadata } from "@/lib/seo";

export const dynamicParams = false;

export function generateStaticParams() {
  return getTopics().map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({ params }: PageProps<"/topics/[slug]">) {
  const { slug } = await params;
  const t = getTopic(slug);
  if (!t) return {};
  const n = storiesForTopic(slug).length;
  return pageMetadata({
    title: `${t.name} — 2026 타임라인`,
    description: `${t.name}: ${t.description}. 2026년 공식 발표 ${n}건을 날짜순으로 정리했습니다.`,
    path: topicHref(t.slug),
    // 기록이 없는 주제 페이지는 색인하지 않는다
    noindex: n === 0,
  });
}

/** Reference의 주제별 Knowledge Archive: 기사 수·최근 업데이트 → 월별 타임라인 → 관련 뉴스레터·차트·카드뉴스 */
export default async function TopicPage({ params }: PageProps<"/topics/[slug]">) {
  const { slug } = await params;
  const topic = getTopic(slug);
  if (!topic) notFound();
  const stories = storiesForTopic(slug);
  const months = new Map<string, typeof stories>();
  for (const s of stories) {
    const k = s.eventDate.slice(0, 7);
    if (!months.has(k)) months.set(k, []);
    months.get(k)!.push(s);
  }
  const issueDates = [...new Set(stories.map((s) => s.eventDate))].slice(0, 8);
  const charts = getCharts().filter((c) => c.topics.includes(slug));
  const cards = getCardnews().filter((c) => c.topics.includes(slug));
  const changes = keyChanges(slug);
  const starters = starterStories(slug);
  const related = relatedTopics(slug);

  return (
    <Wrap>
      <p className="pt-6 text-[13px]">
        <Link href="/topics/" className="text-night-muted hover:text-night-text">
          ← 주제별 전체
        </Link>
      </p>
      <PageHead kicker={`${topicKindLabels[topic.kind]} · TOPIC`} title={topic.name.toUpperCase()}>
        <p>{topic.description}</p>
        {stories[0] ? (
          <p className="mt-2 text-[14px] text-night-text">
            <span className="font-bold text-white">한 줄 요약 · </span>
            2026년 {stories.length}건 기록, 가장 최근은 {formatDate(stories[0].eventDate)} 「{stories[0].title}」입니다.
          </p>
        ) : null}
        <dl className="mt-3 flex gap-6 font-mono text-[13px]">
          <div>
            <dt className="text-night-muted">2026년 기록</dt>
            <dd className="text-[20px] font-bold text-white">{stories.length}건</dd>
          </div>
          <div>
            <dt className="text-night-muted">최근 업데이트</dt>
            <dd className="text-[20px] font-bold text-white">{stories[0] ? formatDate(stories[0].eventDate) : "-"}</dd>
          </div>
        </dl>
      </PageHead>

      {starters.length > 0 ? (
        <section className="mb-12" aria-labelledby="t-start">
          <SectionLabel>
            <span id="t-start">처음 보는 사람이라면</span>
          </SectionLabel>
          <p className="mb-3 text-[12.5px] leading-relaxed text-night-muted">
            선택 규칙: 중요도(1→3) 높은 기사부터, 최근 기사 우선, 분류가 겹치지 않게 최대 5건을 골라 날짜순으로 놓았습니다. 편집자가 손으로 고른 목록이 아닙니다.
          </p>
          <ol className="space-y-2">
            {starters.map((s, i) => (
              <li key={s.slug} className="flex gap-3 rounded-[8px] border border-night-line bg-night-raise px-4 py-3">
                <span className="pt-0.5 font-mono text-[13px] font-bold text-night-accent">{i + 1}</span>
                <div className="min-w-0">
                  <Link href={storyHref(s.slug)} className="text-[15px] font-bold leading-snug text-night-text hover:underline hover:underline-offset-4">
                    {s.title}
                  </Link>
                  <p className="mt-0.5 text-[12.5px] leading-snug text-night-muted">
                    <span className="font-mono">{formatDate(s.eventDate)}</span> · {s.summary}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {changes.length > 1 ? (
        <section className="mb-12" aria-labelledby="t-changes">
          <SectionLabel>
            <span id="t-changes">2026 핵심 변화</span>
          </SectionLabel>
          <p className="mb-3 text-[12.5px] text-night-muted">월마다 중요도가 가장 높은 기사 1건씩입니다.</p>
          <ol className="relative space-y-3 border-l border-night-line pl-5">
            {changes.map((s) => (
              <li key={s.slug} className="relative">
                <span aria-hidden className="absolute -left-[25px] top-[7px] h-2 w-2 rounded-full bg-night-accent" />
                <p className="font-mono text-[12px] text-night-muted">{formatMonth(s.eventDate.slice(0, 7))}</p>
                <Link href={storyHref(s.slug)} className="text-[14.5px] font-semibold leading-snug text-night-text hover:underline hover:underline-offset-4">
                  {s.title}
                </Link>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {stories.length === 0 ? (
        <EmptyState title="아직 기록이 없습니다">
          이 주제의 공식 원문을 수집하지 못했습니다. 수집 가능한 공식 경로가 생기면 이곳에 쌓입니다.
        </EmptyState>
      ) : (
        <section aria-labelledby="timeline">
          <SectionLabel>
            <span id="timeline">TIMELINE</span>
          </SectionLabel>
          <div className="space-y-6">
            {[...months.entries()].map(([m, list]) => (
              <div key={m} className="grid gap-2 sm:grid-cols-[6.5rem_1fr]">
                <h3 className="pt-3.5 font-mono text-[13px] font-semibold text-night-muted">
                  {formatMonth(m).replace("년 ", ".").replace("월", "")}
                  <span className="ml-1.5 text-night-accent">{list.length}</span>
                </h3>
                <DarkCard className="divide-y divide-night-line px-5">
                  {list.map((s) => (
                    <StoryRow key={s.slug} s={s} />
                  ))}
                </DarkCard>
              </div>
            ))}
          </div>
        </section>
      )}

      {related.length > 0 ? (
        <section className="mt-12" aria-labelledby="t-related">
          <SectionLabel href="/topics/" more="주제 전체">
            <span id="t-related">함께 보는 주제</span>
          </SectionLabel>
          <ul className="flex flex-wrap gap-2">
            {related.map(({ topic: t, count }) => (
              <li key={t.slug}>
                <Link href={topicHref(t.slug)} className="inline-flex items-center gap-1.5 rounded-full border border-night-line bg-night-raise px-3 py-1.5 text-[13px] font-semibold text-night-text hover:border-night-muted">
                  {t.name}
                  <span className="font-mono text-[11.5px] text-night-muted">함께 {count}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {issueDates.length > 0 ? (
        <section className="mt-12" aria-labelledby="t-issues">
          <SectionLabel href="/newsletters/" more="뉴스레터 전체">
            <span id="t-issues">관련 뉴스레터</span>
          </SectionLabel>
          <ul className="flex flex-wrap gap-2">
            {issueDates.map((d) => (
              <li key={d}>
                <Link href={issueHref(d)} className="inline-block rounded-[6px] border border-night-line bg-night-raise px-3 py-1.5 font-mono text-[12.5px] text-night-text hover:border-night-muted">
                  {formatDate(d)}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {charts.length > 0 ? (
        <section className="mt-12" aria-labelledby="t-charts">
          <SectionLabel href="/chart/" more="AI차트 전체">
            <span id="t-charts">관련 AI차트</span>
          </SectionLabel>
          <DarkCard className="divide-y divide-night-line">
            {charts.map((c) => (
              <Link key={c.slug} href={chartHref(c.slug)} className="block px-5 py-3.5 text-[15px] font-bold text-night-text hover:bg-night">
                {c.title}
              </Link>
            ))}
          </DarkCard>
        </section>
      ) : null}

      {cards.length > 0 ? (
        <section className="mt-12" aria-labelledby="t-cards">
          <SectionLabel href="/cardnews/" more="카드뉴스 전체">
            <span id="t-cards">관련 카드뉴스</span>
          </SectionLabel>
          <DarkCard className="divide-y divide-night-line">
            {cards.map((c) => (
              <Link key={c.slug} href={cardHref(c.slug)} className="block px-5 py-3.5 text-[15px] font-bold text-night-text hover:bg-night">
                {c.title}
              </Link>
            ))}
          </DarkCard>
        </section>
      ) : null}
    </Wrap>
  );
}
