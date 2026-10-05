import Link from "next/link";
import { notFound } from "next/navigation";
import { CardGrid } from "@/components/Cards";
import { Container, EmptyState, PageIntro, SectionHeading } from "@/components/ui";
import { taskGroupLabels, verdictLabels, versionTypeLabels } from "@/config/labels";
import { getArticle, getArticlesByTask, getTask, getTasks, isTracking } from "@/lib/content";
import { articleHref, formatDate } from "@/lib/format";
import { pageMetadata } from "@/lib/seo";
import type { Article, Verdict } from "@/lib/types";

export const dynamicParams = false;

export function generateStaticParams() {
  return getTasks().map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({ params }: PageProps<"/tasks/[slug]">) {
  const { slug } = await params;
  const task = getTask(slug);
  if (!task) return {};
  return pageMetadata({ title: task.name, description: task.description, path: `/tasks/${task.slug}/` });
}

const buckets: { key: string; label: string; verdicts: Verdict[] }[] = [
  { key: "works", label: "AI로 됨", verdicts: ["useful"] },
  { key: "conditional", label: "조건부", verdicts: ["conditional"] },
  { key: "notyet", label: "아직 안 됨·기대 미달", verdicts: ["notRecommended", "belowClaim"] },
];

export default async function TaskPage({ params }: PageProps<"/tasks/[slug]">) {
  const { slug } = await params;
  const task = getTask(slug);
  if (!task) notFound();

  const all = getArticlesByTask(task.slug);
  const real = all.filter((a) => !a.sample);
  const samples = all.filter((a) => a.sample);

  // 지금까지 확인한 것: 실제 글의 결론에서 자동으로 만든다 (예시 글 제외)
  const judged = real.filter((a) => a.verdict);
  const featured = task.featured.map((s) => getArticle(s)).filter((a): a is Article => a !== undefined && a.task === task.slug);
  const featuredSlugs = new Set(featured.map((a) => a.slug));
  const rest = all.filter((a) => !featuredSlugs.has(a.slug));
  const tested = rest.filter((a) => ["TEST", "CHECK", "BRIEF"].includes(a.format) && !isTracking(a));
  const tracking = rest.filter(isTracking);
  const shortfalls = real.filter((a) => a.verdict === "notRecommended" || a.verdict === "belowClaim");
  const guides = rest.filter((a) => a.format === "GUIDE");
  const changes = real
    .flatMap((a) => a.versions.map((v) => ({ ...v, article: a })))
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
    .slice(0, 5);
  const lastChecked = real.map((a) => a.checkedAt).filter(Boolean).sort().at(-1);

  return (
    <Container>
      <nav aria-label="현재 위치" className="pt-6 text-sm text-muted">
        <Link href="/tasks/" className="hover:text-ink hover:underline">하는 일로 찾기</Link>
        <span aria-hidden> › </span>
        <span>{taskGroupLabels[task.group]}</span>
      </nav>
      <PageIntro title={task.name}>
        <p>{task.description}</p>
        <p className="mt-3 font-mono text-sm text-muted">
          {real.length > 0 ? `확인한 글 ${real.length}건 · 마지막 확인 ${formatDate(lastChecked)}` : "아직 직접 확인한 글이 없습니다. 아래는 구조 확인용 예시입니다."}
        </p>
        {task.note ? <p className="mt-3 border-l-2 border-line-strong pl-3 text-sm text-ink-soft">{task.note}</p> : null}
      </PageIntro>

      <div className="space-y-14 py-10">
        {/* 지금까지 확인한 것 */}
        <section aria-labelledby="summary">
          <SectionHeading id="summary" description="직접 확인한 글의 결론을 모았습니다. 새로 확인하거나 다시 확인하면 바뀝니다.">
            지금까지 확인한 것
          </SectionHeading>
          {judged.length === 0 ? (
            <EmptyState title="아직 결론을 낸 글이 없습니다">직접 확인을 마친 글이 생기면 이곳에 &lsquo;AI로 됨 / 조건부 / 아직 안 됨&rsquo;으로 정리됩니다.</EmptyState>
          ) : (
            <div className="grid gap-4 sm:grid-cols-3">
              {buckets.map((b) => {
                const list = judged.filter((a) => a.verdict && b.verdicts.includes(a.verdict));
                return (
                  <div key={b.key} className="border-t border-line pt-3">
                    <h3 className="mb-2 text-sm font-bold text-ink">{b.label}</h3>
                    {list.length === 0 ? (
                      <p className="text-sm text-muted">없음</p>
                    ) : (
                      <ul className="space-y-2 text-sm">
                        {list.map((a) => (
                          <li key={a.slug}>
                            <Link href={articleHref(a.slug)} className="text-ink-soft underline-offset-4 hover:underline">{a.title}</Link>
                            <span className="ml-1 font-mono text-xs text-muted">{formatDate(a.checkedAt)} · {a.verdict ? verdictLabels[a.verdict] : ""}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {featured.length > 0 ? (
          <section aria-labelledby="featured">
            <SectionHeading id="featured">먼저 볼 글</SectionHeading>
            <CardGrid items={featured} />
          </section>
        ) : null}

        {tested.length > 0 ? (
          <section aria-labelledby="tested">
            <SectionHeading id="tested">직접 해본 것</SectionHeading>
            <CardGrid items={tested} />
          </section>
        ) : null}

        {tracking.length > 0 ? (
          <section aria-labelledby="tracking">
            <SectionHeading id="tracking">진행 중</SectionHeading>
            <CardGrid items={tracking} />
          </section>
        ) : null}

        {shortfalls.length > 0 ? (
          <section aria-labelledby="shortfalls">
            <SectionHeading id="shortfalls">기대 미달·한계</SectionHeading>
            <CardGrid items={shortfalls} />
          </section>
        ) : null}

        {guides.length > 0 ? (
          <section aria-labelledby="guides">
            <SectionHeading id="guides">알아두기</SectionHeading>
            <CardGrid items={guides} />
          </section>
        ) : null}

        {task.nextChecks.length > 0 ? (
          <section aria-labelledby="next">
            <SectionHeading id="next" description="아직 해보지 않은 것입니다. 확인하면 글로 올라옵니다.">
              다음에 확인할 것
            </SectionHeading>
            <ul className="space-y-2">
              {task.nextChecks.map((q) => (
                <li key={q} className="flex gap-3 border-b border-dashed border-line-strong py-3 text-ink-soft">
                  <span aria-hidden className="font-mono text-muted">□</span>
                  <span>{q}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {changes.length > 0 ? (
          <section aria-labelledby="changes">
            <SectionHeading id="changes">최근 변경</SectionHeading>
            <ul className="divide-y divide-line border-y border-line">
              {changes.map((c) => (
                <li key={`${c.article.slug}-${c.date}-${c.type}`} className="py-3 text-sm">
                  <span className="font-mono text-xs text-muted">{formatDate(c.date)}</span>{" "}
                  <span className="font-bold">{versionTypeLabels[c.type]}</span>{" "}
                  <Link href={articleHref(c.article.slug)} className="text-accent underline-offset-4 hover:underline">{c.article.title}</Link>
                  <p className="text-ink-soft">{c.note}</p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {samples.length > 0 && real.length === 0 ? (
          <p className="text-sm text-muted">이 과제의 글 {samples.length}편은 모두 구조 확인용 예시(SAMPLE)입니다.</p>
        ) : null}
      </div>
    </Container>
  );
}
