import Link from "next/link";
import { CategoryTag } from "@/components/news/Story";
import { PageHead, Wrap } from "@/components/ui";
import { getIssues, getStories } from "@/lib/news";
import { formatDate, formatMonth, issueHref, storyHref } from "@/lib/format";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "뉴스레터",
  description: "2026년 1월부터 날짜별로 정리한 AI 뉴스레터 전체 목록입니다. 공식 원문으로 확인한 사건만 담았습니다.",
  path: "/newsletters/",
});

/** Reference의 뉴스레터 목록: 날짜 → 대표 제목 → 그날의 헤드라인 목록. 월별로 묶는다. */
export default function NewslettersPage() {
  const issues = getIssues();
  const total = getStories().length;
  const months = new Map<string, typeof issues>();
  for (const i of issues) {
    const k = i.date.slice(0, 7);
    if (!months.has(k)) months.set(k, []);
    months.get(k)!.push(i);
  }

  return (
    <Wrap>
      <PageHead kicker="날짜별 AI 브리핑" title="뉴스레터">
        <p>AI 회사들의 공식 발표를 발표일 기준으로 묶었습니다. 사건이 없는 날은 발행하지 않아 날짜가 건너뛸 수 있습니다.</p>
        <p className="mt-1 font-mono text-[12.5px]">
          {formatDate(issues.at(-1)?.date)} ~ {formatDate(issues[0]?.date)} · {issues.length}호 · {total}건
        </p>
      </PageHead>

      <nav aria-label="월 바로가기" className="mb-8 flex flex-wrap gap-2">
        {[...months.keys()].map((m) => (
          <a key={m} href={`#m-${m}`} className="rounded-full border border-night-line px-3 py-1 text-[12.5px] font-semibold text-night-muted hover:text-night-text">
            {formatMonth(m)}
          </a>
        ))}
      </nav>

      <div className="space-y-12">
        {[...months.entries()].map(([m, list]) => (
          <section key={m} id={`m-${m}`} aria-labelledby={`h-${m}`} className="scroll-mt-28">
            <h2 id={`h-${m}`} className="mb-4 border-b border-night-line pb-2 text-[18px] font-bold text-white">
              {formatMonth(m)} <span className="ml-1 font-mono text-[13px] font-normal text-night-muted">{list.reduce((n, i) => n + i.stories.length, 0)}건</span>
            </h2>
            <ol className="space-y-7">
              {list.map((issue) => {
                const lead = issue.stories[0];
                return (
                  <li key={issue.date}>
                    <p className="font-mono text-[13px] font-semibold text-night-muted">{formatDate(issue.date)}</p>
                    <Link
                      href={issueHref(issue.date)}
                      className="mt-2 flex items-center gap-3 rounded-[8px] border border-night-line bg-night-raise px-4 py-3 hover:border-night-muted"
                    >
                      <span className="rounded-[4px] bg-night-accent px-1.5 py-0.5 text-[11px] font-extrabold text-night-deep">AI</span>
                      <span className="min-w-0 flex-1 truncate text-[14.5px] font-bold text-white">{lead.title}</span>
                      <span className="shrink-0 font-mono text-[12px] text-night-muted">{issue.stories.length}건</span>
                    </Link>
                    {issue.stories.length > 1 ? (
                      <ul className="mt-2.5 space-y-1 pl-4">
                        {issue.stories.slice(1).map((s) => (
                          <li key={s.slug} className="flex items-baseline gap-2 text-[13.5px] leading-snug text-night-muted">
                            <span aria-hidden>·</span>
                            <Link href={storyHref(s.slug)} className="hover:text-night-text hover:underline hover:underline-offset-4">
                              {s.title}
                            </Link>
                            <span className="hidden shrink-0 sm:inline">
                              <CategoryTag category={s.category} />
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
      </div>
    </Wrap>
  );
}
