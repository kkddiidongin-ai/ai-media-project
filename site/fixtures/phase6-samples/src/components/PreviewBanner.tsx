"use client";

import { usePathname } from "next/navigation";
import { siteConfig } from "@/config/site";

/**
 * 미리보기 모드 안내 — 예시 콘텐츠가 실제 운영 실적처럼 보이지 않게 한다. isPreview: false면 사라진다.
 * 홈은 첫 화면 골격(ticker부터 시작)을 밀어내지 않도록 화면 아래에 붙는 얇은 줄로 표시한다.
 */
export function PreviewBanner() {
  const pathname = usePathname() ?? "/";
  if (!siteConfig.isPreview) return null;

  if (pathname === "/") {
    return (
      <div role="note" className="fixed inset-x-0 bottom-0 z-40 border-t border-amber/40 bg-amber-soft/95">
        <p className="px-4 py-1 text-center text-[11px] leading-4 text-amber">
          <strong className="font-bold">미리보기</strong> · 예시(SAMPLE) 콘텐츠입니다. 실제 실험 결과가 아닙니다.
        </p>
      </div>
    );
  }

  return (
    <div className="border-b border-amber/30 bg-amber-soft">
      <p className="mx-auto max-w-6xl px-4 py-1.5 text-center text-xs leading-relaxed text-amber sm:px-6 lg:px-8">
        <strong className="font-bold">미리보기</strong> · 지금 보이는 글은 사이트 구조를 확인하기 위한 <strong>예시(SAMPLE)</strong>입니다. 실제 실험 결과가 아닙니다.
      </p>
    </div>
  );
}
