import { ArchiveView } from "@/components/ArchiveView";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "날짜별 전체 보기",
  description: "발행한 날짜 순서대로 모든 콘텐츠를 모았습니다.",
  path: "/archive/",
});

export default function ArchivePage() {
  return <ArchiveView page={1} />;
}
