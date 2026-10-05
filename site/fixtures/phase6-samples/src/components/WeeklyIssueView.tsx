import Link from "next/link";
import { getArticle } from "@/lib/content";
import { articleHref, formatDate } from "@/lib/format";
import type { WeeklyIssue, WeeklyItem } from "@/lib/types";
import { feedLabels } from "@/config/labels";
import { SampleMark } from "./Story";

function ItemLine({ item }: { item: WeeklyItem }) {
  const a = item.slug ? getArticle(item.slug) : undefined;
  return (
    <li className="text-ink-soft">
      {item.text}
      {a ? (
        <>
          {" "}
          <Link href={articleHref(a.slug)} className="text-accent underline underline-offset-4">
            {a.title}
          </Link>
        </>
      ) : null}
    </li>
  );
}

function Block({ title, items }: { title: string; items: WeeklyItem[] }) {
  if (items.length === 0) return null;
  return (
    <section className="border-t border-line pt-4">
      <h3 className="mb-2 text-base font-bold text-ink">{title}</h3>
      <ul className="list-disc space-y-1 pl-5">
        {items.map((i, idx) => (
          <ItemLine key={idx} item={i} />
        ))}
      </ul>
    </section>
  );
}

/** 주간 노트 한 호 — 새 원고가 아니라 그 주의 확인 결과를 엮은 편집물 (media-engine.md §12) */
export function WeeklyIssueView({ issue, headingLevel = "h2" }: { issue: WeeklyIssue; headingLevel?: "h1" | "h2" }) {
  const H = headingLevel;
  return (
    <article>
      <header className="border-t-2 border-ink pt-4">
        <p className="flex items-center gap-2 text-[0.8rem] font-bold text-accent">
          {feedLabels.weeklyFormat}
          {issue.issue ? <span className="font-mono font-normal text-muted">{issue.issue}호</span> : null}
          {issue.sample ? <SampleMark /> : null}
        </p>
        <H className="mt-3 font-serif text-[1.85rem] font-bold leading-tight text-ink sm:text-[2.4rem]">{issue.title}</H>
        <p className="mt-3 font-mono text-sm text-muted">
          <time dateTime={issue.date}>{formatDate(issue.date)}</time>
        </p>
        {issue.sample ? (
          <p className="mt-3 text-sm text-amber" role="note">
            예시 호입니다. 실제 주간 정리가 아니며, 운영 실적이 아닙니다.
          </p>
        ) : null}
      </header>
      <div className="prose-article mt-6 max-w-3xl" dangerouslySetInnerHTML={{ __html: issue.html }} />

      <div className="mt-8 max-w-3xl space-y-6">
        <Block title="이번 주 바뀐 것" items={issue.changes} />
        <Block title="이번 주 직접 확인한 것" items={issue.checked} />
        {issue.tryThis ? (
          <section className="border-l-4 border-accent pl-4">
            <h3 className="mb-1 text-base font-bold text-accent-strong">해볼 것 하나</h3>
            <ul>
              <ItemLine item={issue.tryThis} />
            </ul>
          </section>
        ) : null}
        <Block title="진행 중 실험" items={issue.tracking} />
        <Block title="업데이트된 이전 글" items={issue.updates} />
      </div>
    </article>
  );
}
