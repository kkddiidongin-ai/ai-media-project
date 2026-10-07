import Link from "next/link";
import { mainNav, moreNav } from "@/config/labels";
import { siteConfig } from "@/config/site";

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-night-line bg-night-deep pb-12 text-night-muted">
      <div className="mx-auto grid max-w-[800px] gap-8 px-[18px] py-10 text-[13px] sm:grid-cols-[1.5fr_1fr_1fr]">
        <div>
          <p className="text-[15px] font-bold text-night-text">{siteConfig.name}</p>
          <p className="mt-1">{siteConfig.descriptor}</p>
          <p className="mt-4 leading-relaxed">
            모든 기사는 공식 원문과 출처를 함께 적습니다. 원문 기사 본문을 옮기지 않고, 확인한 사실만 새로 써서 정리합니다.
          </p>
        </div>
        <nav aria-label="메뉴">
          <ul className="space-y-2">
            {[...mainNav, ...moreNav].map((n) => (
              <li key={n.href}>
                <Link href={n.href} className="hover:text-night-text">
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label="사이트 정보">
          <ul className="space-y-2">
            <li><Link href="/newsletter/subscribe/" className="font-semibold text-night-accent hover:text-night-text">뉴스레터 구독</Link></li>
            <li><Link href="/method/" className="hover:text-night-text">편집·출처 원칙</Link></li>
            <li><Link href="/method/#sources" className="hover:text-night-text">수집 소스 목록</Link></li>
            <li><Link href="/about/" className="hover:text-night-text">소개</Link></li>
            <li><Link href="/collab/#contact" className="hover:text-night-text">오류 제보·문의</Link></li>
          </ul>
        </nav>
      </div>
      <p className="mx-auto max-w-[800px] px-[18px] text-[12px]">© {siteConfig.name}. 기사 날짜는 원문이 발표된 날 기준입니다.</p>
    </footer>
  );
}
