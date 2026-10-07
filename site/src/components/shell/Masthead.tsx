"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { mainNav, moreNav } from "@/config/labels";
import { siteConfig } from "@/config/site";

export interface TickerItem {
  slug: string;
  name: string;
  count: number;
  latest: string | null;
}

function SearchIcon() {
  return (
    <svg aria-hidden width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="8.5" cy="8.5" r="5.5" />
      <path d="M12.6 12.6L17 17" strokeLinecap="round" />
    </svg>
  );
}

const isActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(href);

/**
 * 모든 페이지 공통 머리 (Phase 6.3): TOP TICKER → PRIMARY HEADER → SECONDARY NAV.
 * 치수는 Reference 실측(1366px): ticker 34 / header 77 / nav 48 (각 아랫선 포함), header 내용 폭 800.
 * ticker는 실제 주제 페이지 바로가기이며, 숫자는 이 사이트가 기록한 기사 수다 (가짜 등락·상태값 없음).
 */
export function Masthead({ ticker }: { ticker: TickerItem[] }) {
  const pathname = usePathname() ?? "/";
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLLIElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const moreActive = moreNav.some((m) => isActive(pathname, m.href));

  // 바깥을 누르거나 Esc를 누르면 더보기 닫기.
  // Phase 6.4 수정: 메뉴(ul#more-menu)는 버튼의 <li> 밖에 렌더링되므로 '바깥' 판정에서 메뉴 영역도 제외해야 한다.
  // (이전에는 메뉴 링크를 mousedown하는 순간 '바깥 클릭'으로 판정돼 메뉴가 사라지고, click이 발생하지 않았다.)
  useEffect(() => {
    if (!moreOpen) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (moreRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setMoreOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setMoreOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [moreOpen]);

  return (
    <div className="bg-night text-night-text">
      {/* TOP TICKER — 주제 바로가기 */}
      <nav aria-label="주요 주제" className="h-[34px] overflow-hidden border-b border-night-line bg-night-deep">
        <ul className="flex h-full items-center whitespace-nowrap text-[12px] leading-none">
          {ticker.map((t) => (
            <li key={t.slug} className="flex h-full shrink-0 items-center border-r border-night-line">
              <Link href={`/topics/${t.slug}/`} className="flex h-full items-center gap-2 px-4 hover:bg-night-raise">
                <span className="font-bold tracking-[0.06em] text-night-text">{t.name.toUpperCase()}</span>
                <span className="font-mono text-night-accent">{t.count}건</span>
                {t.latest ? <span className="font-mono text-night-muted">{t.latest.slice(5).replace("-", ".")}</span> : null}
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
            <span className="text-[20px] font-bold leading-[24px] tracking-[-0.5px] text-white sm:text-[22px]">{siteConfig.shortName}</span>
            <span className="mt-[2px] text-[11px] leading-[13px] text-night-muted">{siteConfig.descriptor}</span>
          </Link>
          {/* 오른쪽 action 자리: 뉴스레터 구독 */}
          <div className="flex justify-end">
            <Link
              href="/newsletter/subscribe/"
              aria-current={pathname.startsWith("/newsletter/subscribe") ? "page" : undefined}
              className="inline-flex h-9 items-center rounded-full border border-night-accent/60 px-3.5 text-[13px] font-bold text-night-accent hover:bg-night-accent hover:text-night-deep"
            >
              구독<span className="max-sm:hidden">하기</span>
            </Link>
          </div>
        </div>
      </header>

      {/* SECONDARY NAV */}
      <nav aria-label="주 메뉴" className="border-b border-night-line bg-night-raise">
        <ul className="mx-auto flex h-[47px] items-stretch justify-center whitespace-nowrap text-[13px] font-bold max-md:justify-start max-md:overflow-x-auto max-md:px-2">
          {mainNav.map((n) => {
            const active = isActive(pathname, n.href);
            return (
              <li key={n.href} className="flex">
                <Link
                  href={n.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center border-b-2 px-[14px] sm:px-[18px] ${
                    active ? "border-night-accent text-night-text" : "border-transparent text-night-muted hover:text-night-text"
                  }`}
                >
                  {n.label}
                </Link>
              </li>
            );
          })}
          <li ref={moreRef} className="relative flex max-md:static">
            <button
              ref={buttonRef}
              type="button"
              aria-expanded={moreOpen}
              aria-haspopup="true"
              aria-controls="more-menu"
              onClick={() => setMoreOpen((v) => !v)}
              className={`flex items-center gap-1 border-b-2 px-[14px] sm:px-[18px] ${
                moreActive ? "border-night-accent text-night-text" : "border-transparent text-night-muted hover:text-night-text"
              }`}
            >
              더보기
              <svg aria-hidden width="10" height="10" viewBox="0 0 10 10" className={moreOpen ? "rotate-180" : ""}>
                <path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </button>
          </li>
        </ul>
        {moreOpen ? (
          <div className="relative mx-auto max-w-[800px]">
            <ul
              ref={menuRef}
              id="more-menu"
              aria-label="더보기 메뉴"
              className="absolute right-4 top-0 z-40 min-w-[180px] rounded-[8px] border border-night-line bg-night-raise py-1 text-[13px] font-medium shadow-xl md:right-[calc(50%-260px)]"
            >
              {moreNav.map((m) => (
                <li key={m.href}>
                  <Link
                    href={m.href}
                    onClick={() => setMoreOpen(false)}
                    aria-current={isActive(pathname, m.href) ? "page" : undefined}
                    className="block px-4 py-2.5 text-night-text hover:bg-night"
                  >
                    {m.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </nav>
    </div>
  );
}
