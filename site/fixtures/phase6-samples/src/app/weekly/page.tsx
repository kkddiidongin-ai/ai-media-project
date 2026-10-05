import Link from "next/link";
import { SampleMark } from "@/components/Story";
import { Container, EmptyState, PageIntro, SectionHeading } from "@/components/ui";
import { WeeklyIssueView } from "@/components/WeeklyIssueView";
import { getWeeklyIssues } from "@/lib/content";
import { formatDate, weeklyHref } from "@/lib/format";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "이번 주",
  description: "일주일 동안 중요했던 변화와 직접 확인한 것을 묶어 보는 주간 정리입니다.",
  path: "/weekly/",
});

export default function WeeklyPage() {
  const issues = getWeeklyIssues();
  const [latest, ...past] = issues;

  return (
    <Container>
      <PageIntro title="이번 주">
        매일 올라오는 콘텐츠와 별도로, 일주일 동안 중요했던 변화와 직접 확인한 것을 한 번에 묶어 보는 주간 정리입니다. 매주 같은 요일에 새 호가 올라옵니다.
      </PageIntro>

      <div className="space-y-12 py-10">
        {latest ? <WeeklyIssueView issue={latest} /> : <EmptyState title="아직 발행한 주간 노트가 없습니다" />}

        <section aria-labelledby="past">
          <SectionHeading id="past">지난 호</SectionHeading>
          {past.length === 0 ? (
            <EmptyState title="지난 호가 아직 없습니다" />
          ) : (
            <ul className="divide-y divide-line border-y border-line">
              {past.map((w) => (
                <li key={w.slug}>
                  <Link href={weeklyHref(w.slug)} className="flex flex-wrap items-center gap-3 py-3 hover:bg-surface">
                    <span className="font-mono text-xs text-muted">{formatDate(w.date)}</span>
                    <span className="font-medium text-ink">{w.title}</span>
                    {w.sample ? <SampleMark /> : null}
                    {w.tryThis ? <span className="w-full text-sm text-ink-soft sm:w-auto">해볼 것: {w.tryThis.text}</span> : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Container>
  );
}
