import Link from "next/link";
import { Wrap } from "@/components/ui";

/**
 * 예전 주소 호환 (Phase 6.3 이전 IA). 정적 사이트라 서버 리디렉트 대신 meta refresh + 링크를 쓴다.
 * React 19는 <meta>를 <head>로 올려 준다. 메인 내비게이션에는 노출하지 않는다.
 */
export function LegacyRedirect({ to, label }: { to: string; label: string }) {
  return (
    <Wrap className="py-20 text-center">
      <meta httpEquiv="refresh" content={`0; url=${to}`} />
      <p className="text-night-muted">이 주소는 바뀌었습니다.</p>
      <Link href={to} className="mt-3 inline-block font-bold text-night-accent underline underline-offset-4">
        {label}(으)로 이동 →
      </Link>
    </Wrap>
  );
}
