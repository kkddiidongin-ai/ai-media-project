import Link from "next/link";
import type { ReactNode } from "react";

/**
 * 공통 화면 골격 (Phase 6.3). Reference 실측: 가운데 column 720px(좌우 여백 18 → 내용 684).
 * 모든 메뉴가 같은 폭·같은 머리 구조를 써서 한 매체로 보이게 한다.
 */
export function Wrap({ children, className = "", wide = false }: { children: ReactNode; className?: string; wide?: boolean }) {
  return <div className={`mx-auto w-full ${wide ? "max-w-[1000px]" : "max-w-[720px]"} px-[18px] ${className}`}>{children}</div>;
}

/** 페이지 머리: 짧은 강조선 + 작은 kicker → 큰 제목 → 한 줄 설명 */
export function PageHead({ kicker, title, children, badge }: { kicker: string; title: ReactNode; children?: ReactNode; badge?: ReactNode }) {
  return (
    <header className="pb-8 pt-8 sm:pt-10">
      <p className="flex items-center gap-2 text-[12px] font-extrabold tracking-[0.08em] text-night-accent">
        <span aria-hidden className="inline-block h-[2px] w-5 bg-night-accent" />
        {kicker}
      </p>
      <h1 className="mt-2 flex flex-wrap items-center gap-3 text-[28px] font-bold leading-tight tracking-[-0.02em] text-white sm:text-[32px]">
        {title}
        {badge}
      </h1>
      {children ? <div className="mt-2 text-[15px] leading-relaxed text-night-muted">{children}</div> : null}
    </header>
  );
}

export function Badge({ children, tone = "accent" }: { children: ReactNode; tone?: "accent" | "amber" | "muted" }) {
  const cls =
    tone === "amber"
      ? "border-amber-soft/40 bg-amber-soft/10 text-amber-soft"
      : tone === "muted"
        ? "border-night-line text-night-muted"
        : "border-night-accent/40 bg-night-accent/10 text-night-accent";
  return <span className={`inline-flex items-center rounded-[4px] border px-1.5 py-[1px] font-mono text-[11px] font-bold tracking-wider ${cls}`}>{children}</span>;
}

/** 어두운 면 위 카드 */
export function DarkCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-[10px] border border-night-line bg-night-raise ${className}`}>{children}</div>;
}

/** 읽는 면: 종이색 카드 (기사·뉴스레터 본문) */
export function PaperCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`overflow-hidden rounded-[8px] border border-night-line bg-paper text-ink ${className}`}>{children}</div>;
}

/** 어두운 면 위 작은 섹션 이름 */
export function SectionLabel({ children, href, more }: { children: ReactNode; href?: string; more?: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-4">
      <h2 className="text-[12px] font-extrabold tracking-[0.08em] text-night-accent">{children}</h2>
      {href ? (
        <Link href={href} className="text-[12.5px] font-semibold text-night-muted hover:text-night-text">
          {more ?? "전체 보기"} →
        </Link>
      ) : null}
    </div>
  );
}

/** 카드 아래 가로 한 줄 버튼 (Reference의 '전체 보기') */
export function WideLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="mt-[10px] flex h-[46px] items-center justify-center rounded-[8px] border border-night-line bg-night-raise text-[14px] font-bold text-night-text hover:border-night-muted"
    >
      {children}
    </Link>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-[10px] border border-dashed border-night-line px-6 py-10 text-center">
      <p className="font-bold text-night-text">{title}</p>
      {children ? <div className="mt-2 text-sm leading-relaxed text-night-muted">{children}</div> : null}
    </div>
  );
}
