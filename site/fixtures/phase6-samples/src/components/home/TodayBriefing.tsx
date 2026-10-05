import Link from "next/link";
import { formatLabels, sampleNotice, todayLabels } from "@/config/labels";
import type { DayGroup } from "@/lib/daily";
import { archiveHref, articleHref, dateAnchor, formatDate, formatShortDate } from "@/lib/format";
import { SampleMark } from "../Story";

/**
 * 오늘의 Daily Briefing Surface (Phase 6.2-A).
 * reference 실측(1366px): 중앙 column 720(좌우 여백 18 → 내용 684), label → card 간격 12,
 * card 높이 745에서 잘리고 아래 흐림, card와 "전체 보기" 간격 10, 버튼 높이 46.
 * 구성: 오늘 올라온 글 색인(위) → "오늘 AI에서 확인할 것" 요약 묶음(아래).
 */

const INDEX_ROWS = 10;
const BRIEF_ITEMS = 4;

export function TodayBriefing({ day, archivePage }: { day: DayGroup; archivePage: number }) {
  const rows = day.articles.slice(0, INDEX_ROWS);
  const brief = day.articles.slice(0, BRIEF_ITEMS);
  const anySample = day.articles.some((a) => a.sample);
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <section aria-labelledby="today-label" className="bg-night pb-16 text-night-text">
      <div className="mx-auto max-w-[720px] px-[18px] pt-[26px]">
        <h2 id="today-label" className="mb-3 flex items-baseline gap-2 text-[11.5px] font-extrabold leading-5 tracking-[0.1em] text-night-accent">
          {todayLabels.label}
          <time dateTime={day.date} className="text-[12.5px] font-semibold tracking-normal text-night-muted">
            {formatShortDate(day.date)}
          </time>
        </h2>

        {/* card: 745에서 잘리고 아래를 흐리게 (전체는 "전체 보기"로) */}
        <div className="relative max-h-[745px] overflow-hidden rounded-[8px] border border-night-line bg-paper text-ink">
          {/* 위: 오늘 올라온 글 색인 */}
          <div className="border-b border-line bg-surface px-9 py-5">
            <p className="mb-2.5 flex items-center gap-2 text-[11px] font-bold leading-[19px] tracking-[1px] text-muted">
              {todayLabels.indexTitle} · {formatDate(day.date)} · {day.articles.length}편
              {anySample ? <SampleMark /> : null}
            </p>
            <ol className="text-[13px] leading-[22px]">
              {rows.map((a, i) => (
                <li key={a.slug} className="grid h-[33px] grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-line">
                  <span className="font-mono text-[12px] text-muted">{pad(i + 1)}</span>
                  <Link href={articleHref(a.slug)} className="truncate font-bold text-ink hover:underline hover:underline-offset-4">
                    {a.title}
                  </Link>
                  <span className="text-[12px] font-bold text-accent">{formatLabels[a.format]}</span>
                </li>
              ))}
            </ol>
            {anySample ? <p className="mt-3 text-[11px] leading-[18px] text-muted">{sampleNotice}</p> : null}
          </div>

          {/* 아래: 오늘 AI에서 확인할 것 */}
          <div className="px-9 py-[30px]">
            <div className="rounded-[6px] border border-line bg-surface px-6 py-5">
              <h3 className="border-b border-line pb-3 text-[16px] font-bold leading-[26px] text-ink">{todayLabels.briefTitle}</h3>
              <ol className="mt-4 space-y-4">
                {brief.map((a, i) => (
                  <li key={a.slug} className="grid grid-cols-[1.75rem_minmax(0,1fr)] text-[14px] leading-[23.8px] tracking-[-0.2px]">
                    <span className="font-mono text-[12px] leading-[23.8px] text-muted">{pad(i + 1)}</span>
                    <p>
                      <Link href={articleHref(a.slug)} className="font-bold text-ink hover:underline hover:underline-offset-4">
                        {a.title}
                      </Link>{" "}
                      <span className="text-ink-soft">{a.summary}</span>
                      {a.sample ? <SampleMark className="ml-1.5 align-[1px]" /> : null}
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          </div>

          <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-[150px] bg-gradient-to-b from-paper/0 to-paper" />
        </div>

        <Link
          href={`${archiveHref(archivePage)}#${dateAnchor(day.date)}`}
          className="mt-[10px] flex h-[46px] items-center justify-center rounded-[8px] border border-night-line bg-night-raise text-[14px] font-bold text-night-text hover:border-night-muted"
        >
          {todayLabels.viewAll}
        </Link>
      </div>
    </section>
  );
}
