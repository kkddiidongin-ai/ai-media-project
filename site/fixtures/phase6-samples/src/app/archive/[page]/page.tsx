import { notFound } from "next/navigation";
import { ArchiveView } from "@/components/ArchiveView";
import { archivePageCount } from "@/lib/daily";
import { pageMetadata } from "@/lib/seo";

export const dynamicParams = false;

/**
 * 2쪽부터는 /archive/2/ 형태. 정적 빌드는 빈 목록을 허용하지 않으므로 1쪽도 만들어 두고,
 * 1쪽은 canonical을 /archive/로 돌린다. 사이트 안의 링크는 항상 /archive/를 쓴다.
 */
export function generateStaticParams() {
  return Array.from({ length: archivePageCount() }, (_, i) => ({ page: String(i + 1) }));
}

export async function generateMetadata({ params }: PageProps<"/archive/[page]">) {
  const { page } = await params;
  const n = Number(page);
  return pageMetadata({
    title: n > 1 ? `날짜별 전체 보기 (${n}쪽)` : "날짜별 전체 보기",
    description: "발행한 날짜 순서대로 모든 콘텐츠를 모았습니다.",
    path: n > 1 ? `/archive/${n}/` : "/archive/",
  });
}

export default async function ArchivePagedPage({ params }: PageProps<"/archive/[page]">) {
  const { page } = await params;
  const n = Number(page);
  if (!Number.isInteger(n) || n < 1 || n > archivePageCount()) notFound();
  return <ArchiveView page={n} />;
}
