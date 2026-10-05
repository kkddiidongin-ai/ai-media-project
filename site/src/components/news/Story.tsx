import Link from "next/link";
import { categoryLabels, sourceTypeLabels, verificationLabels } from "@/config/labels";
import { formatDate, hostOf, issueHref, storyHref, topicHref } from "@/lib/format";
import { getTopic, type Story, type StorySection } from "@/lib/news";
import { SaveButton } from "./SaveButton";

/** CATEGORY 표시 (작은 영문 대문자 + 한글) */
export function CategoryTag({ category, tone = "dark" }: { category: Story["category"]; tone?: "dark" | "paper" }) {
  const c = categoryLabels[category];
  return (
    <span className={`text-[11px] font-extrabold tracking-[0.08em] ${tone === "dark" ? "text-night-accent" : "text-accent"}`}>
      {c.en}
      <span className="sr-only"> ({c.ko})</span>
    </span>
  );
}

export function TopicChips({ slugs, tone = "dark" }: { slugs: string[]; tone?: "dark" | "paper" }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {slugs.map((s) => {
        const t = getTopic(s);
        if (!t) return null;
        return (
          <li key={s}>
            <Link
              href={topicHref(s)}
              className={`inline-block rounded-full border px-2.5 py-0.5 text-[12px] font-semibold ${
                tone === "dark" ? "border-night-line text-night-muted hover:text-night-text" : "border-line-strong text-ink-soft hover:border-ink"
              }`}
            >
              {t.name}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** 어두운 목록의 한 줄: 분류 · 제목 · 날짜/출처 */
export function StoryRow({ s, showDate = true, numbered }: { s: Story; showDate?: boolean; numbered?: number }) {
  return (
    <article className="group relative flex gap-3 py-3.5">
      {numbered !== undefined ? <span className="w-6 shrink-0 pt-[18px] font-mono text-[12px] text-night-muted">{String(numbered).padStart(2, "0")}</span> : null}
      <div className="min-w-0 flex-1">
        <CategoryTag category={s.category} />
        <h3 className="mt-1 text-[15.5px] font-bold leading-snug text-night-text">
          <Link href={storyHref(s.slug)} className="after:absolute after:inset-0 group-hover:underline group-hover:underline-offset-4">
            {s.title}
          </Link>
        </h3>
        <p className="mt-1 text-[12.5px] text-night-muted">
          {showDate ? <span className="font-mono">{formatDate(s.eventDate)} · </span> : null}
          {s.sourceName}
        </p>
      </div>
    </article>
  );
}

/** 출처 상자 (원문 링크·발표일·수집일·확인 방식). 심층 기사는 Primary / Secondary / 추가 확인을 나눠 보여준다 */
export function SourceBox({ s, compact = false }: { s: Story; compact?: boolean }) {
  const deep = s.editorialDepth === "deep";
  const sources = [{ ...s, primary: true }, ...s.secondarySources.map((x) => ({ ...x, primary: false }))];
  const tag = (primary: boolean) => (deep ? (primary ? "PRIMARY" : "SECONDARY") : primary ? "원문" : "추가");
  return (
    <div className="rounded-[6px] border border-line bg-surface px-4 py-3 text-[13px]">
      <p className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[11px] font-extrabold tracking-[0.08em] text-muted">
        SOURCE
        <span className="font-semibold tracking-normal">{verificationLabels[s.provenance.verification]}</span>
      </p>
      <ul className="space-y-2.5">
        {sources.map((x) => (
          <li key={x.sourceUrl} className="leading-snug">
            <span className="mr-1.5 inline-block rounded-[3px] bg-paper px-1 text-[11px] font-bold text-ink-soft">
              {tag(x.primary)} · {sourceTypeLabels[x.sourceType]}
            </span>
            <a href={x.sourceUrl} className="font-semibold text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink" rel="noopener noreferrer" target="_blank">
              {x.sourceTitle}
            </a>
            <span className="block text-[12px] text-muted">
              {x.sourceName} · {hostOf(x.sourceUrl)} · 발표 {formatDate(x.sourcePublishedAt)}
              {deep ? ` · 확인 ${formatDate(s.updatedAt)}` : ""}
            </span>
          </li>
        ))}
      </ul>
      {deep && compact && s.references?.length ? (
        <p className="mt-2.5 border-t border-line pt-2 text-[12px] text-ink-soft">
          추가 확인 자료 {s.references.length}건은{" "}
          <Link href={storyHref(s.slug)} className="font-semibold text-ink underline decoration-line-strong underline-offset-2">
            전체 기사
          </Link>
          에서 볼 수 있습니다.
        </p>
      ) : null}
      {deep && !compact && s.references?.length ? (
        <>
          <p className="mb-1.5 mt-3 border-t border-line pt-2.5 text-[11px] font-extrabold tracking-[0.08em] text-muted">추가 확인 자료 · 편집자가 직접 대조한 공식 문서</p>
          <ul className="space-y-2.5">
            {s.references.map((r) => (
              <li key={r.sourceUrl} className="leading-snug">
                <a href={r.sourceUrl} className="font-semibold text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink" rel="noopener noreferrer" target="_blank">
                  {r.sourceTitle}
                </a>
                <span className="block text-[12px] text-muted">
                  {r.sourceName} · {hostOf(r.sourceUrl)}
                  {r.sourcePublishedAt ? ` · 발표 ${formatDate(r.sourcePublishedAt)}` : ""} · 확인 {formatDate(r.checkedAt)}
                </span>
                {r.note ? <span className="block text-[12px] text-ink-soft">확인한 내용: {r.note}</span> : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <p className="mt-2 border-t border-line pt-2 text-[11.5px] text-muted">
        수집 {formatDate(s.collectedAt)} · 정리 {formatDate(s.publishedAt)}
        {s.updatedAt !== s.publishedAt ? ` · 수정 ${formatDate(s.updatedAt)}` : ""} · 원문 본문은 옮기지 않았습니다.
        {deep ? " 회사가 밝힌 수치·성능은 본문에서 출처를 붙여 구분했습니다." : ""}
      </p>
    </div>
  );
}

/** 심층 기사 본문 한 덩어리: 역할별로 모양을 달리해 사실(기본)·해석(AI MEDIA POINT)·독자 영향·미확인 사항을 구분한다 */
function DeepSection({ sec, level }: { sec: StorySection; level: "h2" | "h3" }) {
  const H = level;
  const body = (
    <>
      {sec.paragraphs.map((p) => (
        <p key={p} className="mt-2.5 text-[15px] leading-[1.85] text-ink first:mt-0">
          {p}
        </p>
      ))}
      {sec.bullets.length ? (
        <ul className={`${sec.paragraphs.length ? "mt-3" : ""} space-y-2 text-[14.5px] leading-[1.75] text-ink`}>
          {sec.bullets.map((b) => (
            <li key={b} className="flex gap-2.5">
              <span aria-hidden className="mt-[11px] h-1 w-1 shrink-0 rounded-full bg-ink" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
  if (sec.role === "point")
    return (
      <section className="mt-8 border-l-2 border-accent pl-4 sm:pl-5">
        <p className="text-[11px] font-extrabold tracking-[0.08em] text-accent">AI MEDIA POINT · 해석</p>
        <H className="mb-2.5 mt-1 text-[17px] font-bold leading-snug text-ink">{sec.heading}</H>
        {body}
      </section>
    );
  if (sec.role === "users")
    return (
      <section className="mt-8 rounded-[6px] bg-accent-soft px-4 py-4 sm:px-5">
        <p className="text-[11px] font-extrabold tracking-[0.08em] text-accent-strong">그래서 나한테는?</p>
        <H className="mb-2.5 mt-1 text-[17px] font-bold leading-snug text-ink">{sec.heading}</H>
        {body}
      </section>
    );
  if (sec.role === "open")
    return (
      <section className="mt-8 rounded-[6px] border border-dashed border-line-strong px-4 py-4 sm:px-5">
        <p className="text-[11px] font-extrabold tracking-[0.08em] text-muted">미확인 · 공식 발표만으로 알 수 없는 것</p>
        <H className="mb-2.5 mt-1 text-[17px] font-bold leading-snug text-ink">{sec.heading}</H>
        {body}
      </section>
    );
  return (
    <section className="mt-8">
      <H className="mb-2.5 text-[18px] font-bold leading-snug tracking-[-0.01em] text-ink">{sec.heading}</H>
      {body}
    </section>
  );
}

/** 핵심 사실 (심층 기사: 본문 전후로 빠르게 확인하는 요약 상자) */
function FactsBox({ facts, deep }: { facts: string[]; deep: boolean }) {
  return (
    <section className={deep ? "mt-5 rounded-[6px] border border-line bg-surface px-4 py-3.5 sm:px-5" : "mt-5"}>
      <h3 className="mb-1.5 text-[12px] font-extrabold tracking-[0.06em] text-muted">{deep ? "핵심 사실 · 한눈에 보기" : "핵심 사실"}</h3>
      <ul className="space-y-1.5 text-[14.5px] leading-[1.7] text-ink">
        {facts.map((f) => (
          <li key={f} className="flex gap-2">
            <span aria-hidden className="mt-[11px] h-1 w-1 shrink-0 rounded-full bg-ink" />
            {f}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * 기사 전체 (종이 면). 뉴스레터 상세와 기사 페이지가 함께 쓴다.
 * 순서: CATEGORY → HEADLINE → AI MEDIA 설명 → 핵심 사실 → 왜 중요한가(해석) → 무엇이 달라지나 → SOURCE → 관련 주제
 */
export function StoryBody({
  s,
  number,
  headingLevel = "h2",
  linkTitle = false,
  preview = false,
}: {
  s: Story;
  number?: number;
  headingLevel?: "h1" | "h2";
  linkTitle?: boolean;
  /** 뉴스레터 안에서 심층 기사를 짧게 보여줄 때: 리드·핵심 사실·첫 섹션 + 전체 내용 보기 */
  preview?: boolean;
}) {
  const H = headingLevel;
  const deep = s.editorialDepth === "deep" && !!s.sections?.length;
  const sectionLevel = headingLevel === "h1" ? "h2" : "h3";
  return (
    <article id={s.slug} className="scroll-mt-28 px-6 py-7 sm:px-9">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2">
          {number !== undefined ? <span className="font-mono text-[12px] font-bold text-muted">{String(number).padStart(2, "0")}</span> : null}
          <CategoryTag category={s.category} tone="paper" />
        </p>
        <SaveButton slug={s.slug} />
      </div>
      <H className={`mt-2 font-bold leading-[1.35] tracking-[-0.01em] text-ink ${headingLevel === "h1" ? "text-[26px] sm:text-[30px]" : "text-[20px] sm:text-[22px]"}`}>
        {linkTitle ? (
          <Link href={storyHref(s.slug)} className="hover:underline hover:underline-offset-4">
            {s.title}
          </Link>
        ) : (
          s.title
        )}
      </H>
      {deep ? (
        <p className="mt-3 text-[16px] font-medium leading-[1.8] text-ink">{s.lead}</p>
      ) : (
        <p className="mt-3 text-[15.5px] leading-[1.75] text-ink-soft">{s.summary}</p>
      )}

      <FactsBox facts={s.facts} deep={deep} />

      {deep && preview ? (
        <>
          {s.sections!.slice(0, 1).map((sec) => (
            <DeepSection key={sec.heading} sec={sec} level={sectionLevel} />
          ))}
          <Link
            href={storyHref(s.slug)}
            className="mt-6 flex items-center justify-between gap-3 rounded-[6px] border border-ink px-4 py-3 text-[14.5px] font-bold text-ink hover:bg-ink hover:text-paper"
          >
            <span>
              전체 내용 보기
              <span className="mt-0.5 block text-[12.5px] font-normal text-muted sm:ml-2 sm:mt-0 sm:inline">이전과 달라진 점 · 나에게 미치는 영향 · 아직 모르는 것</span>
            </span>
            <span aria-hidden>→</span>
          </Link>
        </>
      ) : deep ? (
        s.sections!.map((sec) => <DeepSection key={sec.heading} sec={sec} level={sectionLevel} />)
      ) : (
        <>
          <section className="mt-5 border-l-2 border-accent pl-4">
            <h3 className="mb-1 text-[12px] font-extrabold tracking-[0.06em] text-accent">
              왜 중요한가 <span className="font-semibold text-muted">· AI MEDIA 해석</span>
            </h3>
            <p className="text-[14.5px] leading-[1.75] text-ink">{s.whyItMatters}</p>
          </section>

          <section className="mt-4 rounded-[6px] bg-accent-soft px-4 py-3">
            <h3 className="mb-1 text-[12px] font-extrabold tracking-[0.06em] text-accent-strong">그래서 나한테는?</h3>
            <p className="text-[14.5px] leading-[1.75] text-ink">{s.whatChanges}</p>
          </section>
        </>
      )}

      <div className={deep && !preview ? "mt-8" : "mt-5"}>
        <SourceBox s={s} compact={deep && preview} />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <TopicChips slugs={s.topics} tone="paper" />
        <Link href={issueHref(s.eventDate)} className="text-[12.5px] font-semibold text-muted hover:text-ink">
          {formatDate(s.eventDate)} 뉴스레터 →
        </Link>
      </div>
    </article>
  );
}

/** MORE 묶음의 짧은 기사 (종이 면): 분류 · 제목 · 요약 · 그래서 나한테는? → 전체 기사로 */
export function StoryBrief({ s, number }: { s: Story; number?: number }) {
  return (
    <article id={s.slug} className="scroll-mt-28 px-6 py-5 sm:px-9">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2">
          {number !== undefined ? <span className="font-mono text-[12px] font-bold text-muted">{String(number).padStart(2, "0")}</span> : null}
          <CategoryTag category={s.category} tone="paper" />
        </p>
        <SaveButton slug={s.slug} />
      </div>
      <h3 className="mt-1.5 text-[17px] font-bold leading-[1.4] text-ink">
        <Link href={storyHref(s.slug)} className="hover:underline hover:underline-offset-4">
          {s.title}
        </Link>
      </h3>
      <p className="mt-1.5 text-[14px] leading-[1.7] text-ink-soft">{s.summary}</p>
      <p className="mt-1.5 text-[13.5px] leading-[1.65] text-ink">
        <span className="font-bold text-accent-strong">그래서 나한테는? </span>
        {s.whatChanges}
      </p>
      <p className="mt-1.5 text-[12px] text-muted">
        {s.sourceName} ·{" "}
        <Link href={storyHref(s.slug)} className="font-semibold text-ink underline decoration-line-strong underline-offset-2">
          핵심 사실·출처 보기
        </Link>
      </p>
    </article>
  );
}
