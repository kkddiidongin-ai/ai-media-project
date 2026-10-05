"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { navLabels } from "@/config/labels";
import { siteConfig } from "@/config/site";

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/" || pathname.startsWith("/archive/");
  return pathname === href || pathname.startsWith(href);
}

function SearchIcon() {
  return (
    <svg aria-hidden width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="8.5" cy="8.5" r="5.5" />
      <path d="M12.6 12.6L17 17" strokeLinecap="round" />
    </svg>
  );
}

/**
 * 미디어형 헤더 (Phase 6.1): 브랜드 · 메뉴 · 검색. 로그인·구독·교육 버튼 없음.
 * 모바일은 브랜드 · 검색 · 메뉴 버튼만 둔다.
 */
export function SiteHeader() {
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Esc로 메뉴 닫기
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const searchActive = pathname.startsWith("/search");

  // 홈은 Phase 6.2-A의 전용 머리(HomeMasthead)를 쓴다. 다른 페이지는 승인 전까지 이 헤더 유지.
  if (pathname === "/") return null;

  return (
    <header className="sticky top-0 z-30 border-b border-ink/80 bg-paper/95 backdrop-blur-sm">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4 sm:px-6 md:h-16 lg:px-8">
        <Link href="/" className="flex items-baseline gap-3" onClick={() => setOpen(false)}>
          <span className="font-serif text-lg font-bold tracking-tight text-ink md:text-xl">{siteConfig.shortName}</span>
          <span className="hidden text-xs text-muted xl:inline">{siteConfig.tagline}</span>
        </Link>

        {/* 데스크톱 메뉴 */}
        <nav aria-label="주 메뉴" className="ml-auto hidden md:block">
          <ul className="flex items-center">
            {navLabels.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`block px-3 py-2 text-[0.95rem] transition-colors lg:px-3.5 ${
                      active ? "font-bold text-ink underline decoration-2 underline-offset-[10px]" : "font-medium text-ink-soft hover:text-ink"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <Link
          href="/search/"
          aria-current={searchActive ? "page" : undefined}
          className={`ml-auto inline-flex h-10 w-10 items-center justify-center rounded-sm md:ml-1 ${
            searchActive ? "text-accent" : "text-ink hover:text-accent"
          }`}
          onClick={() => setOpen(false)}
        >
          <SearchIcon />
          <span className="sr-only">검색</span>
        </Link>

        <button
          ref={buttonRef}
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-sm text-ink md:hidden"
          aria-expanded={open}
          aria-controls="mobile-menu"
          onClick={() => setOpen((v) => !v)}
        >
          <span className="sr-only">{open ? "메뉴 닫기" : "메뉴 열기"}</span>
          <svg aria-hidden width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
            {open ? <path d="M5 5l10 10M15 5L5 15" /> : <path d="M3 6h14M3 10h14M3 14h14" />}
          </svg>
        </button>
      </div>

      {open ? (
        <nav id="mobile-menu" aria-label="주 메뉴" className="border-t border-line bg-paper md:hidden">
          <ul className="mx-auto max-w-6xl px-4 py-2 sm:px-6">
            {navLabels.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setOpen(false)}
                    className={`block border-b border-line py-3 text-base ${active ? "font-bold text-ink" : "text-ink-soft"}`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
            <li>
              <Link href="/archive/" onClick={() => setOpen(false)} className="block border-b border-line py-3 text-base text-ink-soft">
                날짜별 전체 보기
              </Link>
            </li>
            <li>
              <Link href="/about/" onClick={() => setOpen(false)} className="block py-3 text-sm text-muted">
                소개
              </Link>
            </li>
          </ul>
        </nav>
      ) : null}
    </header>
  );
}
