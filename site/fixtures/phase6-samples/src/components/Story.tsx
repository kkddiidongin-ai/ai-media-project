import Link from "next/link";
import { formatLabels, sampleLabel, verdictLabels } from "@/config/labels";
import { articleHref, formatDate } from "@/lib/format";
import type { StoryData } from "@/lib/story";

/**
 * 콘텐츠 한 편을 목록에 보여주는 표시 전용 컴포넌트 (Phase 6.1).
 * 카드 상자 대신 글자 위계(글 종류 → 제목 → 요약 → 메타)와 얇은 구분선으로 보여준다.
 * 서버 전용 모듈을 쓰지 않으므로 검색(클라이언트)에서도 그대로 쓴다.
 */

export function SampleMark({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-[2px] bg-amber-soft px-1 font-mono text-[0.65rem] font-bold leading-[1.5] tracking-wider text-amber ${className}`}
      title="구조 확인용 예시 글입니다. 실제 실험 결과가 아닙니다."
    >
      {sampleLabel}
    </span>
  );
}

export function FormatTag({ s, className = "" }: { s: Pick<StoryData, "format" | "sample">; className?: string }) {
  return (
    <p className={`flex items-center gap-2 text-[0.8rem] font-bold leading-none text-accent ${className}`}>
      <span>{formatLabels[s.format]}</span>
      {s.sample ? <SampleMark /> : null}
    </p>
  );
}

function Meta({ s, showDate }: { s: StoryData; showDate?: boolean }) {
  const parts: React.ReactNode[] = [];
  if (showDate && s.publishedAt) parts.push(<time key="d" dateTime={s.publishedAt} className="font-mono">{formatDate(s.publishedAt)}</time>);
  if (s.taskName) parts.push(<span key="t">{s.taskName}</span>);
  if (s.note) parts.push(<span key="n">{s.note}</span>);
  if (s.verdict) parts.push(<span key="v" className="font-bold text-ink-soft">결론 · {verdictLabels[s.verdict]}</span>);
  if (parts.length === 0) return null;
  return (
    <p className="mt-2 flex flex-wrap items-center gap-x-2 text-xs text-muted">
      {parts.map((p, i) => (
        <span key={i} className="flex items-center gap-x-2">
          {i > 0 ? <span aria-hidden className="text-line-strong">·</span> : null}
          {p}
        </span>
      ))}
    </p>
  );
}

type Variant = "lead" | "default" | "compact";

const titleClass: Record<Variant, string> = {
  lead: "mt-3 font-serif text-[1.85rem] font-bold leading-[1.25] tracking-tight sm:text-[2.6rem]",
  default: "mt-2 font-serif text-[1.2rem] font-bold leading-snug sm:text-[1.3rem]",
  compact: "mt-1.5 font-serif text-[1.05rem] font-bold leading-snug",
};

export function StoryItem({
  s,
  variant = "default",
  showDate = false,
  headingLevel = "h3",
}: {
  s: StoryData;
  variant?: Variant;
  showDate?: boolean;
  headingLevel?: "h2" | "h3" | "h4";
}) {
  const H = headingLevel;
  return (
    <article className="group relative">
      <FormatTag s={s} />
      <H className={`${titleClass[variant]} text-ink`}>
        <Link
          href={articleHref(s.slug)}
          className="after:absolute after:inset-0 after:content-[''] group-hover:underline group-hover:decoration-1 group-hover:underline-offset-[5px]"
        >
          {s.title}
        </Link>
      </H>
      {variant === "lead" ? (
        <p className="mt-4 max-w-2xl text-[1.05rem] leading-relaxed text-ink-soft sm:text-lg">{s.summary}</p>
      ) : variant === "default" ? (
        <p className="mt-1.5 line-clamp-2 text-[0.95rem] leading-relaxed text-ink-soft">{s.summary}</p>
      ) : null}
      {variant !== "compact" ? <Meta s={s} showDate={showDate} /> : null}
    </article>
  );
}

/**
 * 제목 목록: 데스크톱에서는 2단, 모바일은 1단 세로 피드.
 * 하루 1편이든 5편이든 같은 규칙으로 흐른다.
 */
export function StoryList({ items, showDate = false, columns = 2 }: { items: StoryData[]; showDate?: boolean; columns?: 1 | 2 }) {
  return (
    <ul className={`grid gap-x-10 ${columns === 2 ? "md:grid-cols-2" : ""}`}>
      {items.map((s) => (
        <li
          key={s.slug}
          className={`border-t border-line py-5 first:border-t-0 first:pt-1 ${
            columns === 2 ? "md:[&:nth-child(2)]:border-t-0 md:[&:nth-child(2)]:pt-1" : ""
          }`}
        >
          <StoryItem s={s} showDate={showDate} />
        </li>
      ))}
    </ul>
  );
}
