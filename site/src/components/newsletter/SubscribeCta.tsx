import Link from "next/link";
import { siteConfig } from "@/config/site";

/** 구독 페이지로 보내는 띠 (홈 · 뉴스레터 목록 · 각 호 하단) */
export function SubscribeCta({ className = "" }: { className?: string }) {
  return (
    <aside
      aria-label="뉴스레터 구독"
      className={`flex flex-col gap-3 rounded-[10px] border border-night-accent/40 bg-night-raise px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6 ${className}`}
    >
      <div>
        <p className="text-[15px] font-bold text-night-text">AI마중을 이메일로 받아보세요</p>
        <p className="mt-1 text-[13.5px] leading-relaxed text-night-muted">
          지금 알아야 할 AI 변화만 골라 쉽게 정리해 보내드립니다. {siteConfig.tagline}
        </p>
      </div>
      <Link
        href="/newsletter/subscribe/"
        className="inline-flex h-11 shrink-0 items-center justify-center rounded-[8px] bg-night-accent px-5 text-[14px] font-extrabold text-night-deep hover:bg-[#a3d3bb]"
      >
        무료로 구독하기
      </Link>
    </aside>
  );
}
