import Link from "next/link";
import { DayGroupView } from "@/components/DayGroup";
import { HomeMasthead } from "@/components/home/HomeMasthead";
import { TodayBriefing } from "@/components/home/TodayBriefing";
import { SampleMark } from "@/components/Story";
import { Container, EmptyState } from "@/components/ui";
import { feedLabels } from "@/config/labels";
import { siteConfig } from "@/config/site";
import { getWeeklyIssues } from "@/lib/content";
import { archivePageOf, getDays } from "@/lib/daily";
import { archiveHref, dateAnchor, formatDate, weeklyHref } from "@/lib/format";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({ path: "/" });

/**
 * 홈 = 최신 콘텐츠 발견.
 * Phase 6.2-A: 첫 화면(ticker → header → nav → 오늘의 AI 브리핑 → 전체 보기)을 dark shell로 다시 만들었다.
 * 그 아래(지난 콘텐츠·날짜 묶음)는 Phase 6.1 구조 그대로이며 아직 다시 디자인하지 않았다.
 * 최근 homeDays일치만 보여주고, 그 이전은 /archive/ 페이지로 넘긴다 (무한 스크롤 없음).
 */
export default function HomePage() {
  const days = getDays();
  const shown = days.slice(0, siteConfig.feed.homeDays);
  const firstHidden = days[siteConfig.feed.homeDays];
  const weekly = getWeeklyIssues()[0];
  const today = shown[0];
  const past = shown.slice(1);

  return (
    <>
      <h1 className="sr-only">{siteConfig.name} — 오늘의 AI 브리핑</h1>
      <HomeMasthead />

      {!today ? (
        <Container className="py-12">
          <EmptyState title="아직 발행한 콘텐츠가 없습니다" />
        </Container>
      ) : (
        <>
          <TodayBriefing day={today} archivePage={archivePageOf(today.date)} />

          {/* ---------- 여기부터 아래는 Phase 6.1 그대로 (6.2-A 범위 밖) ---------- */}
          <Container className="pb-8 pt-12">
            {weekly ? (
              <section aria-label="이번 주 정리" className="mb-10 border-y border-line py-4">
                <Link href={weeklyHref(weekly.slug)} className="group flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-4">
                  <span className="flex shrink-0 items-center gap-2 text-[0.8rem] font-bold text-accent">
                    {feedLabels.weeklyFormat}
                    {weekly.sample ? <SampleMark /> : null}
                  </span>
                  <span className="font-serif text-lg font-bold text-ink group-hover:underline group-hover:underline-offset-4">{weekly.title}</span>
                  {weekly.tryThis ? <span className="line-clamp-1 text-sm text-ink-soft sm:flex-1">해볼 것 하나 · {weekly.tryThis.text}</span> : null}
                  <span className="shrink-0 font-mono text-xs text-muted">{formatDate(weekly.date)}</span>
                </Link>
              </section>
            ) : null}

            {/* 지난 날짜 묶음 (오늘 글은 위 브리핑과 "전체 보기"에서 본다) */}
            {past.length > 0 ? (
              <div className="space-y-12">
                {past.map((day) => (
                  <DayGroupView key={day.date} day={day} />
                ))}
              </div>
            ) : (
              <EmptyState title="지난 날짜의 콘텐츠가 아직 없습니다" />
            )}

            <nav aria-label="이전 콘텐츠" className="mt-14 flex flex-wrap items-center justify-between gap-4 border-t-2 border-ink pt-4">
              {firstHidden ? (
                <Link
                  href={`${archiveHref(archivePageOf(firstHidden.date))}#${dateAnchor(firstHidden.date)}`}
                  className="font-bold text-ink underline decoration-1 underline-offset-4 hover:text-accent"
                >
                  {feedLabels.older} →
                </Link>
              ) : (
                <p className="text-sm text-muted">여기까지가 지금까지 올라온 전부입니다.</p>
              )}
              <Link href="/archive/" className="text-sm text-ink-soft underline underline-offset-4 hover:text-ink">
                {feedLabels.archive}
              </Link>
            </nav>
          </Container>
        </>
      )}
    </>
  );
}
