import Link from "next/link";
import { homeMore, homeNav, tickerTopics } from "@/config/labels";
import { siteConfig } from "@/config/site";
import { SampleMark } from "../Story";

/**
 * 홈 첫 화면 머리 (Phase 6.2-A): TOP TICKER → PRIMARY HEADER → SECONDARY NAV.
 * 치수는 reference(1366px) 실측에 맞춤: ticker 34 / header 77 / nav 48 (각 1px 아랫선 포함), header 내용 폭 800.
 * 다른 페이지는 아직 기존 SiteHeader를 쓴다 (사용자 승인 전 확장하지 않음).
 */

function SearchIcon() {
  return (
    <svg aria-hidden width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="8.5" cy="8.5" r="5.5" />
      <path d="M12.6 12.6L17 17" strokeLinecap="round" />
    </svg>
  );
}

export function HomeMasthead() {
  return (
    <div className="bg-night text-night-text">
      {/* TOP TICKER — AI 주제 바로가기 */}
      <nav aria-label="AI 주제" className="h-[34px] overflow-hidden border-b border-night-line bg-night-deep">
        <ul className="flex h-full items-center whitespace-nowrap text-[12px] leading-none">
          <li className="flex h-full shrink-0 items-center gap-2 px-4">
            <SampleMark />
          </li>
          {tickerTopics.map((t) => (
            <li key={t.label} className="flex h-full shrink-0 items-center border-l border-night-line">
              <Link
                href={`/search/?q=${encodeURIComponent(t.q)}`}
                className="flex h-full items-center gap-2 px-4 hover:bg-night-raise"
              >
                <span className="font-bold tracking-[0.06em] text-night-text">{t.label}</span>
                <span className="text-night-muted">{t.note}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* PRIMARY HEADER — 검색 | 브랜드(화면 정중앙) | 빈 action 자리 */}
      <header className="border-b border-night-line">
        <div className="mx-auto grid h-[76px] max-w-[800px] grid-cols-[1fr_auto_1fr] items-center px-4 md:px-0">
          <div>
            <Link
              href="/search/"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-night-muted hover:bg-night-raise hover:text-night-text"
            >
              <SearchIcon />
              <span className="sr-only">검색</span>
            </Link>
          </div>
          <Link href="/" className="flex flex-col items-center text-center">
            <span className="text-[22px] font-bold leading-[24px] tracking-[-0.5px] text-white">{siteConfig.shortName}</span>
            <span className="mt-[2px] text-[11px] leading-[13px] text-night-muted">{siteConfig.descriptor}</span>
          </Link>
          {/* 오른쪽 action 자리: 지금은 비워 둔다 (구독·로그인 없음) */}
          <div aria-hidden />
        </div>
      </header>

      {/* SECONDARY NAV — 가운데 정렬 */}
      <nav aria-label="주 메뉴" className="border-b border-night-line bg-night-raise">
        <ul className="mx-auto flex h-[47px] items-stretch justify-center whitespace-nowrap max-md:justify-start max-md:overflow-x-auto text-[13px] font-bold">
          {homeNav.map((n) => {
            const active = n.href === "/";
            return (
              <li key={n.href} className="flex">
                <Link
                  href={n.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center border-b-2 px-[18px] ${
                    active ? "border-night-accent text-night-text" : "border-transparent text-night-muted hover:text-night-text"
                  }`}
                >
                  {n.label}
                </Link>
              </li>
            );
          })}
          <li className="relative flex">
            <details className="group flex">
              <summary className="flex h-full cursor-pointer items-center gap-1 px-[18px] text-night-muted hover:text-night-text">
                더보기
                <svg aria-hidden width="10" height="10" viewBox="0 0 10 10" className="transition-transform group-open:rotate-180">
                  <path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              </summary>
              <ul className="absolute right-0 top-full z-20 min-w-[168px] rounded-md border border-night-line bg-night-raise py-1 text-[13px] font-medium shadow-lg">
                {homeMore.map((m) => (
                  <li key={m.href}>
                    <Link href={m.href} className="block px-4 py-2 text-night-text hover:bg-night">
                      {m.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          </li>
        </ul>
      </nav>
    </div>
  );
}
