import Link from "next/link";
import { Wrap } from "@/components/ui";

export default function NotFound() {
  return (
    <Wrap className="py-20 text-center">
      <p className="font-mono text-sm text-night-muted">404</p>
      <h1 className="mt-2 text-[26px] font-bold text-white">찾는 페이지가 없습니다</h1>
      <p className="mt-3 text-night-muted">주소가 바뀌었거나 삭제된 페이지일 수 있습니다.</p>
      <div className="mt-8 flex flex-wrap justify-center gap-5 font-bold">
        <Link href="/newsletters/" className="text-night-accent underline underline-offset-4">
          뉴스레터
        </Link>
        <Link href="/topics/" className="text-night-accent underline underline-offset-4">
          주제별
        </Link>
        <Link href="/" className="text-night-accent underline underline-offset-4">
          홈
        </Link>
      </div>
    </Wrap>
  );
}
