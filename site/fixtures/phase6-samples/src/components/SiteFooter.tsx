import Link from "next/link";
import { siteConfig } from "@/config/site";

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t-2 border-ink">
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 sm:grid-cols-[1.4fr_1fr_1fr_1fr] sm:px-6 lg:px-8">
        <div>
          <p className="font-serif text-lg font-bold text-ink">{siteConfig.name}</p>
          <p className="mt-1 text-sm text-muted">{siteConfig.descriptor}</p>
          <p className="mt-4 text-sm text-ink-soft">{siteConfig.tagline}</p>
        </div>
        <nav aria-label="콘텐츠 찾기">
          <ul className="space-y-2 text-sm">
            <li><Link className="text-ink-soft hover:text-ink hover:underline" href="/archive/">날짜별 전체 보기</Link></li>
            <li><Link className="text-ink-soft hover:text-ink hover:underline" href="/tasks/">하는 일로 찾기</Link></li>
            <li><Link className="text-ink-soft hover:text-ink hover:underline" href="/weekly/">이번 주</Link></li>
            <li><Link className="text-ink-soft hover:text-ink hover:underline" href="/search/">검색</Link></li>
          </ul>
        </nav>
        <nav aria-label="사이트 정보">
          <ul className="space-y-2 text-sm">
            <li><Link className="text-ink-soft hover:text-ink hover:underline" href="/about/">소개</Link></li>
            <li><Link className="text-ink-soft hover:text-ink hover:underline" href="/method/">확인 방법</Link></li>
            <li><Link className="text-ink-soft hover:text-ink hover:underline" href="/method/#editorial">편집 원칙</Link></li>
            <li><Link className="text-ink-soft hover:text-ink hover:underline" href="/method/#disclosure">광고·제휴 표시</Link></li>
          </ul>
        </nav>
        <nav aria-label="기록과 문의">
          <ul className="space-y-2 text-sm">
            <li><Link className="text-ink-soft hover:text-ink hover:underline" href="/record/#corrections">정정 기록</Link></li>
            <li><Link className="text-ink-soft hover:text-ink hover:underline" href="/about/#contact">오류 제보</Link></li>
            <li><Link className="text-ink-soft hover:text-ink hover:underline" href="/about/#contact">기관·교육 문의</Link></li>
          </ul>
        </nav>
      </div>
      <div className="border-t border-line">
        <p className="mx-auto max-w-6xl px-4 py-4 text-xs text-muted sm:px-6 lg:px-8">
          © {siteConfig.name}. 모든 글은 확인한 날짜 기준입니다.
        </p>
      </div>
    </footer>
  );
}
