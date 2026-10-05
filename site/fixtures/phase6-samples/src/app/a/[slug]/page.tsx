import Link from "next/link";
import { notFound } from "next/navigation";
import { SampleMark, StoryItem } from "@/components/Story";
import {
  disclosureLabels,
  formatLabels,
  relationLabels,
  sampleNotice,
  verdictLabels,
  verificationDescriptions,
  verificationLabels,
  versionTypeLabels,
} from "@/config/labels";
import { siteConfig } from "@/config/site";
import { getArticle, getArticles, getArticlesByTask, getTask } from "@/lib/content";
import { formatDate, taskHref, trackProgress } from "@/lib/format";
import { articleJsonLd, pageMetadata } from "@/lib/seo";
import { toStory } from "@/lib/story";

export const dynamicParams = false;

export function generateStaticParams() {
  return getArticles().map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: PageProps<"/a/[slug]">) {
  const { slug } = await params;
  const a = getArticle(slug);
  if (!a) return {};
  return pageMetadata({ title: a.title, description: a.summary, path: `/a/${a.slug}/`, type: "article", noindex: a.sample });
}

function Column({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-[46rem] px-4 sm:px-6 ${className}`}>{children}</div>;
}

function SectionTitle({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="mb-3 border-t-2 border-ink pt-3 text-lg font-bold text-ink">
      {children}
    </h2>
  );
}

function ListBlock({ title, items, emptyText }: { title: string; items: string[]; emptyText?: string }) {
  if (items.length === 0 && !emptyText) return null;
  return (
    <div className="border-t border-line pt-3">
      <h3 className="mb-2 text-sm font-bold text-ink">{title}</h3>
      {items.length > 0 ? (
        <ul className="list-disc space-y-1 pl-5 text-ink-soft">
          {items.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">{emptyText}</p>
      )}
    </div>
  );
}

/**
 * 글 페이지 (Phase 6.1): 읽는 경험 우선.
 * 글 종류 → 제목 → 요약 → 발행일·확인일·작성자 → 본문 순서이고,
 * 확인 방식·조건 같은 신뢰 정보는 본문 뒤에 작게 둔다 (기사보다 크게 보이지 않게).
 */
export default async function ArticlePage({ params }: PageProps<"/a/[slug]">) {
  const { slug } = await params;
  const a = getArticle(slug);
  if (!a) notFound();
  const task = getTask(a.task);
  const jsonLd = articleJsonLd(a);
  const verdictChange = a.versions.find((v) => v.verdictFrom && v.verdictTo);
  const related = a.related
    .map((r) => ({ ...r, article: getArticle(r.slug) }))
    .filter((r) => r.article);
  const relatedSlugs = new Set([a.slug, ...related.map((r) => r.slug)]);
  const sameTask = getArticlesByTask(a.task)
    .filter((x) => !relatedSlugs.has(x.slug))
    .slice(0, 4)
    .map(toStory);
  const isTrack = a.format === "TRACK";
  const lastChecked = a.checkedAt ?? a.updatedAt;
  const checkInfo: [string, string][] = [
    ["확인 방식", a.verificationMethod ? verificationDescriptions[a.verificationMethod] : "-"],
    ["사용 도구", a.tools.length > 0 ? a.tools.join(", ") : "-"],
    ["조건", a.conditions ?? "-"],
    ["확인한 날", a.checkedAt ? formatDate(a.checkedAt) : "확인 전"],
    ["다음 점검", a.nextCheckAt ? formatDate(a.nextCheckAt) : "-"],
  ];

  return (
    <article className="pb-6">
      {jsonLd ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} /> : null}

      {/* ---------- 머리 ---------- */}
      <header>
        <Column className="pt-8 sm:pt-12">
          {verdictChange ? (
            <p className="mb-5 border-l-4 border-stamp pl-3 text-sm text-stamp">
              {formatDate(verdictChange.date)} 다시 확인한 결과 결론이 바뀌었습니다 ({verdictLabels[verdictChange.verdictFrom!]} →{" "}
              {verdictLabels[verdictChange.verdictTo!]}).
            </p>
          ) : null}

          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.85rem]">
            <span className="font-bold text-accent">{formatLabels[a.format]}</span>
            {task ? (
              <>
                <span aria-hidden className="text-line-strong">·</span>
                <Link href={taskHref(task.slug)} className="text-ink-soft hover:text-ink hover:underline hover:underline-offset-4">
                  {task.name}
                </Link>
              </>
            ) : null}
            {a.sample ? <SampleMark className="ml-1" /> : null}
          </p>

          <h1 className="mt-4 font-serif text-[2rem] font-bold leading-[1.25] tracking-tight text-ink sm:text-[2.75rem]">{a.title}</h1>
          <p className="mt-4 text-lg leading-relaxed text-ink-soft sm:text-xl">{a.summary}</p>

          <dl className="mt-6 flex flex-wrap gap-x-5 gap-y-1 border-y border-line py-3 text-sm text-muted">
            <div className="flex gap-1.5">
              <dt>발행</dt>
              <dd className="font-mono text-ink-soft">{a.publishedAt ? formatDate(a.publishedAt) : "-"}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt>최근 확인</dt>
              <dd className={lastChecked ? "font-mono text-ink-soft" : "text-ink-soft"}>{lastChecked ? formatDate(lastChecked) : "확인 전"}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt>{siteConfig.operator.bylineLabel}</dt>
              <dd className="text-ink-soft">{a.sample ? "예시 글 (작성자 표시 안 함)" : siteConfig.operator.name}</dd>
            </div>
          </dl>

          {/* 판정 한 줄 — 작게 */}
          <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            {isTrack ? (
              <span>
                <span className="font-bold text-accent">진행 중</span> ·{" "}
                {a.sample ? `${a.track?.days ?? 30}일 예정 (시작 전)` : trackProgress(a.track?.startedAt, a.track?.days ?? 30)}
              </span>
            ) : a.verdict ? (
              <span className="font-bold text-ink">결론 · {verdictLabels[a.verdict]}</span>
            ) : (
              <span>결론 · 아직 없음</span>
            )}
            {a.verificationMethod ? (
              <>
                <span aria-hidden className="text-line-strong">·</span>
                <span>확인 방식 · {verificationLabels[a.verificationMethod]}</span>
              </>
            ) : null}
          </p>

          {a.sample ? (
            <p className="mt-3 text-sm text-amber" role="note">
              {sampleNotice}
            </p>
          ) : null}

          {/* 이해관계 — 있으면 반드시 첫 화면 (편집 정책 M1) */}
          {a.disclosure !== "none" ? (
            <p className="mt-3 border-l-4 border-stamp pl-3 text-sm font-medium text-stamp">광고·제휴 표시 · {disclosureLabels[a.disclosure]}</p>
          ) : null}

          {/* 핵심 결과 (측정한 것만, 최대 3줄) */}
          {a.keyResults.length > 0 ? (
            <dl className="mt-5 divide-y divide-line border-y border-line">
              {a.keyResults.map((k) => (
                <div key={k.label} className="flex justify-between gap-4 py-2 text-sm">
                  <dt className="text-muted">{k.label}</dt>
                  <dd className="text-right font-bold text-ink">{k.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </Column>
      </header>

      {/* ---------- 본문 ---------- */}
      <Column className="pt-8">
        {/* CHECK: 확인한 주장 */}
        {a.claim ? (
          <aside aria-label="확인한 주장" className="mb-8 border-l-4 border-ink pl-4">
            <p className="text-xs font-bold text-muted">확인한 주장</p>
            <p className="mt-1 font-serif text-lg font-bold text-ink">{a.claim.text}</p>
            <p className="mt-1 text-sm text-muted">
              출처:{" "}
              {a.claim.sourceUrl ? (
                <a href={a.claim.sourceUrl} className="underline" rel="noopener noreferrer">
                  {a.claim.source}
                </a>
              ) : (
                a.claim.source
              )}
              {a.claim.checkedAt ? ` · 확인 ${formatDate(a.claim.checkedAt)}` : ""}
            </p>
          </aside>
        ) : null}

        {/* 문제 → 과정 → 결과 → 실패·한계 → 혼자 해보려면 */}
        <div className="prose-article" dangerouslySetInnerHTML={{ __html: a.html }} />

        {/* 확인 정보: 확인 방식·조건·도구 */}
        <section aria-labelledby="check-info" className="mt-12">
          <SectionTitle id="check-info">확인 정보</SectionTitle>
          <dl className="divide-y divide-line text-sm">
            {checkInfo.map(([k, v]) => (
              <div key={k} className="flex gap-4 py-2">
                <dt className="w-20 shrink-0 text-muted">{k}</dt>
                <dd className="text-ink-soft">{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* 누구에게 맞는지 */}
        <section aria-labelledby="fit" className="mt-12">
          <SectionTitle id="fit">누구에게 맞나</SectionTitle>
          <div className="grid gap-5 sm:grid-cols-2">
            <ListBlock title="이런 분께 맞아요" items={a.fitFor} emptyText={a.sample ? "확인한 뒤 작성합니다." : undefined} />
            <ListBlock title="이런 분께는 안 맞아요" items={a.notFor} emptyText={a.sample ? "확인한 뒤 작성합니다." : undefined} />
          </div>
        </section>

        {a.nextQuestions.length > 0 ? (
          <section aria-labelledby="next-q" className="mt-12">
            <SectionTitle id="next-q">다음에 확인할 것</SectionTitle>
            <ul className="space-y-2">
              {a.nextQuestions.map((q) => (
                <li key={q} className="flex gap-3 text-ink-soft">
                  <span aria-hidden className="font-mono text-muted">
                    □
                  </span>
                  {q}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* ---------- 하단: 관련 콘텐츠 · 같은 과제 · 바뀐 기록 ---------- */}
        {related.length > 0 ? (
          <section aria-labelledby="more" className="mt-16">
            <SectionTitle id="more">이어 읽기</SectionTitle>
            <ul className="divide-y divide-line">
              {related.map((r) => (
                <li key={r.slug} className="py-4 first:pt-1">
                  <p className="mb-1 text-xs font-bold text-muted">{relationLabels[r.type]}</p>
                  <StoryItem s={toStory(r.article!)} variant="compact" />
                  <p className="mt-1 text-sm text-ink-soft">{r.reason}</p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {task ? (
          <section aria-labelledby="same-task" className="mt-12">
            <SectionTitle id="same-task">같은 과제 · {task.name}</SectionTitle>
            {sameTask.length > 0 ? (
              <ul className="divide-y divide-line">
                {sameTask.map((s) => (
                  <li key={s.slug} className="py-3.5 first:pt-1">
                    <StoryItem s={s} variant="compact" />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">이 과제의 다른 글이 아직 없습니다.</p>
            )}
            <p className="mt-3">
              <Link href={taskHref(task.slug)} className="text-sm font-bold text-ink underline underline-offset-4 hover:text-accent">
                {task.name} 전체 보기 →
              </Link>
            </p>
          </section>
        ) : null}

        <details className="mt-12 border-y border-line">
          <summary className="flex items-center gap-2 py-3 text-sm font-bold">
            <span aria-hidden className="chev text-muted">
              ›
            </span>
            바뀐 기록
            <span className="ml-auto text-xs font-normal text-muted">{a.versions.length > 0 ? `${a.versions.length}건` : "없음"}</span>
          </summary>
          <div className="border-t border-line py-3 text-sm">
            {a.versions.length === 0 ? (
              <p className="text-muted">아직 바뀐 기록이 없습니다.</p>
            ) : (
              <ol className="space-y-2">
                {a.versions.map((v) => (
                  <li key={`${v.date}-${v.type}`}>
                    <span className="font-mono text-xs text-muted">{formatDate(v.date)}</span> <span className="font-bold">{versionTypeLabels[v.type]}</span> —{" "}
                    {v.note}
                    {v.verdictFrom && v.verdictTo ? ` (결론: ${verdictLabels[v.verdictFrom]} → ${verdictLabels[v.verdictTo]})` : ""}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </details>

        <footer className="mt-6 space-y-1 text-xs leading-relaxed text-muted">
          <p>
            <span className="font-bold">이 글의 제작에 AI를 쓴 부분</span> · {a.aiUse ?? "기록 없음"}
          </p>
          <p>광고·제휴 표시 · {disclosureLabels[a.disclosure]}</p>
          <p>
            틀린 내용을 발견하셨나요?{" "}
            <Link href="/about/#contact" className="underline">
              오류 제보
            </Link>{" "}
            ·{" "}
            <Link href="/method/" className="underline">
              이 사이트의 확인 방법
            </Link>
          </p>
        </footer>
      </Column>
    </article>
  );
}
