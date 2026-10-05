import Link from "next/link";
import { DayGroupView } from "@/components/DayGroup";
import { Container, EmptyState, PageIntro } from "@/components/ui";
import { archivePageCount, getArchivePage, getDays } from "@/lib/daily";
import { archiveHref, formatDate } from "@/lib/format";

/** 날짜별 전체 보기 — 최신 날짜부터 페이지당 archiveDaysPerPage일씩 */
export function ArchiveView({ page }: { page: number }) {
  const total = archivePageCount();
  const days = getArchivePage(page);
  const all = getDays();
  const count = all.reduce((n, d) => n + d.articles.length, 0);

  return (
    <Container>
      <PageIntro eyebrow="아카이브" title="날짜별 전체 보기">
        <p>
          발행한 날짜 순서대로 모든 콘텐츠를 모았습니다.
          {all.length > 0 ? (
            <span className="mt-1 block font-mono text-sm text-muted">
              {formatDate(all.at(-1)!.date)} ~ {formatDate(all[0].date)} · {all.length}일 · {count}편
            </span>
          ) : null}
        </p>
      </PageIntro>

      <div className="space-y-12 py-10">
        {days.length === 0 ? <EmptyState title="아직 발행한 콘텐츠가 없습니다" /> : days.map((d) => <DayGroupView key={d.date} day={d} />)}
      </div>

      {total > 1 ? (
        <nav aria-label="페이지" className="flex flex-wrap items-center justify-between gap-4 border-t-2 border-ink pt-4">
          {page > 1 ? (
            <Link href={archiveHref(page - 1)} className="font-bold text-ink underline underline-offset-4">← 최근 콘텐츠</Link>
          ) : (
            <span />
          )}
          <ol className="flex flex-wrap gap-1 font-mono text-sm">
            {Array.from({ length: total }, (_, i) => i + 1).map((p) => (
              <li key={p}>
                <Link
                  href={archiveHref(p)}
                  aria-current={p === page ? "page" : undefined}
                  className={`inline-block min-w-8 px-2 py-1 text-center ${p === page ? "bg-ink text-paper" : "text-ink-soft hover:text-ink"}`}
                >
                  {p}
                </Link>
              </li>
            ))}
          </ol>
          {page < total ? (
            <Link href={archiveHref(page + 1)} className="font-bold text-ink underline underline-offset-4">이전 콘텐츠 →</Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </Container>
  );
}
