import Link from "next/link";
import { notFound } from "next/navigation";
import { NarrowContainer } from "@/components/ui";
import { WeeklyIssueView } from "@/components/WeeklyIssueView";
import { getWeeklyIssue, getWeeklyIssues } from "@/lib/content";
import { weeklyHref } from "@/lib/format";
import { pageMetadata } from "@/lib/seo";

export const dynamicParams = false;

export function generateStaticParams() {
  return getWeeklyIssues().map((w) => ({ issue: w.slug }));
}

export async function generateMetadata({ params }: PageProps<"/weekly/[issue]">) {
  const { issue } = await params;
  const w = getWeeklyIssue(issue);
  if (!w) return {};
  return pageMetadata({ title: w.title, path: `/weekly/${w.slug}/`, noindex: w.sample });
}

export default async function WeeklyIssuePage({ params }: PageProps<"/weekly/[issue]">) {
  const { issue } = await params;
  const all = getWeeklyIssues();
  const idx = all.findIndex((w) => w.slug === issue);
  if (idx < 0) notFound();
  const w = all[idx];
  const newer = all[idx - 1];
  const older = all[idx + 1];

  return (
    <NarrowContainer className="py-10">
      <p className="mb-4 text-sm">
        <Link href="/weekly/" className="text-accent underline underline-offset-4">이번 주 목록</Link>
      </p>
      <WeeklyIssueView issue={w} headingLevel="h1" />
      <nav aria-label="다른 호" className="mt-6 flex justify-between gap-4 text-sm">
        {older ? <Link href={weeklyHref(older.slug)} className="text-accent underline">← 이전 호</Link> : <span />}
        {newer ? <Link href={weeklyHref(newer.slug)} className="text-accent underline">다음 호 →</Link> : <span />}
      </nav>
    </NarrowContainer>
  );
}
