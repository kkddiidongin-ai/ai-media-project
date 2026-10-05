import Link from "next/link";
import { notFound } from "next/navigation";
import { StoryBody, StoryBrief } from "@/components/news/Story";
import { PaperCard, Wrap } from "@/components/ui";
import { getIssue, getIssues } from "@/lib/news";
import { formatDate, formatLongDate, issueHref } from "@/lib/format";
import { pageMetadata } from "@/lib/seo";

export const dynamicParams = false;

const MAIN_THRESHOLD = 6;
const MAIN_SIZE = 5;

export function generateStaticParams() {
  return getIssues().map((i) => ({ date: i.date }));
}

export async function generateMetadata({ params }: PageProps<"/newsletters/[date]">) {
  const { date } = await params;
  const issue = getIssue(date);
  if (!issue) return {};
  return pageMetadata({
    title: `AI 뉴스레터 ${formatDate(date)}`,
    description: issue.stories.map((s) => s.title).slice(0, 3).join(" / "),
    path: issueHref(date),
    type: "article",
    publishedTime: issue.compiledAt,
    modifiedTime: issue.stories.map((s) => s.updatedAt).sort().at(-1),
  });
}

/** 날짜별 뉴스레터 상세: 머리(날짜·주요 내용) → story 전체 → 이전/다음 호 */
export default async function IssuePage({ params }: PageProps<"/newsletters/[date]">) {
  const { date } = await params;
  const all = getIssues();
  const idx = all.findIndex((i) => i.date === date);
  if (idx < 0) notFound();
  const issue = all[idx];
  const newer = all[idx - 1];
  const older = all[idx + 1];
  // 기사가 많은 날(6건 이상)은 MAIN(중요도 순 상위 5건, 전체 기사) / MORE(나머지, 짧게)로 나눈다
  const split = issue.stories.length >= MAIN_THRESHOLD;
  const main = split ? issue.stories.slice(0, MAIN_SIZE) : issue.stories;
  const more = split ? issue.stories.slice(MAIN_SIZE) : [];

  return (
    <Wrap className="pt-8">
      <p className="mb-3 text-[13px]">
        <Link href="/newsletters/" className="text-night-muted hover:text-night-text">
          ← 뉴스레터 전체
        </Link>
      </p>
      <PaperCard>
        <header className="bg-ink px-6 py-7 text-paper sm:px-9">
          <p className="text-[12px] font-extrabold tracking-[0.12em] text-night-accent">AI NEWSLETTER</p>
          <h1 className="mt-1 text-[26px] font-bold tracking-[-0.02em] text-white sm:text-[30px]">{formatLongDate(issue.date)}</h1>
          {issue.backfilled ? (
            <p className="mt-2 text-[12.5px] leading-relaxed text-night-muted">
              이 날 발표된 공식 원문을 {formatDate(issue.compiledAt)}에 확인해 소급 정리한 호입니다.
            </p>
          ) : null}
        </header>

        <nav aria-label="오늘의 주요 내용" className="border-b border-line bg-surface px-6 py-5 sm:px-9">
          <p className="mb-2 text-[11px] font-extrabold tracking-[0.08em] text-muted">
            오늘의 주요 내용{split ? ` · MAIN ${main.length} · MORE ${more.length}` : ""}
          </p>
          <ol className="space-y-1.5">
            {main.map((s, i) => (
              <li key={s.slug} className="flex gap-2.5 text-[14.5px] leading-snug">
                <span className="w-5 shrink-0 font-mono text-[12px] leading-[22px] text-muted">{i + 1}.</span>
                <a href={`#${s.slug}`} className="font-semibold text-ink hover:underline hover:underline-offset-4">
                  {s.title}
                </a>
              </li>
            ))}
          </ol>
          {more.length > 0 ? (
            <>
              <p className="mb-1.5 mt-4 text-[11px] font-extrabold tracking-[0.08em] text-muted">MORE · 짧게 보기</p>
              <ol className="space-y-1" start={main.length + 1}>
                {more.map((s, i) => (
                  <li key={s.slug} className="flex gap-2.5 text-[13.5px] leading-snug">
                    <span className="w-5 shrink-0 font-mono text-[12px] leading-[20px] text-muted">{main.length + i + 1}.</span>
                    <a href={`#${s.slug}`} className="text-ink-soft hover:text-ink hover:underline hover:underline-offset-4">
                      {s.title}
                    </a>
                  </li>
                ))}
              </ol>
            </>
          ) : null}
        </nav>

        {split ? <p className="px-6 pt-5 text-[11px] font-extrabold tracking-[0.12em] text-accent sm:px-9">MAIN</p> : null}
        <div className="divide-y divide-line">
          {main.map((s, i) => (
            <StoryBody key={s.slug} s={s} number={i + 1} linkTitle preview />
          ))}
        </div>

        {more.length > 0 ? (
          <section aria-labelledby="issue-more" className="border-t-4 border-line bg-surface">
            <h2 id="issue-more" className="px-6 pt-6 text-[11px] font-extrabold tracking-[0.12em] text-accent sm:px-9">
              MORE <span className="font-semibold tracking-normal text-muted">· 같은 날 나온 다른 소식 {more.length}건</span>
            </h2>
            <div className="divide-y divide-line">
              {more.map((s, i) => (
                <StoryBrief key={s.slug} s={s} number={main.length + i + 1} />
              ))}
            </div>
          </section>
        ) : null}
      </PaperCard>

      <nav aria-label="다른 호" className="mt-6 grid grid-cols-2 gap-3 text-[13px]">
        {older ? (
          <Link href={issueHref(older.date)} className="rounded-[8px] border border-night-line bg-night-raise px-4 py-3 text-night-muted hover:text-night-text">
            ← 이전 호 <span className="block font-mono text-night-text">{formatDate(older.date)}</span>
          </Link>
        ) : (
          <span />
        )}
        {newer ? (
          <Link href={issueHref(newer.date)} className="rounded-[8px] border border-night-line bg-night-raise px-4 py-3 text-right text-night-muted hover:text-night-text">
            다음 호 → <span className="block font-mono text-night-text">{formatDate(newer.date)}</span>
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </Wrap>
  );
}
