import { siteConfig } from "@/config/site";

/**
 * 공개 전 미리보기 안내 — 화면 아래 얇은 줄 (레이아웃을 밀어내지 않음).
 * siteConfig.isPreview: false로 바꾸면 사라지고, 검색엔진 색인도 열린다.
 */
export function PreviewBanner() {
  if (!siteConfig.isPreview) return null;
  return (
    <div role="note" className="fixed inset-x-0 bottom-0 z-50 border-t border-amber/40 bg-amber-soft/95">
      <p className="px-4 py-1 text-center text-[11px] leading-4 text-amber">
        <strong className="font-bold">공개 전 미리보기</strong> · 검색엔진에 노출되지 않습니다. AI톡·AI강의·YouTube는 준비 중입니다.
      </p>
    </div>
  );
}
