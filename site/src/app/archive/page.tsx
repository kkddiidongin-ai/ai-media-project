import { LegacyRedirect } from "@/components/shell/LegacyRedirect";
import { pageMetadata } from "@/lib/seo";

// Phase 6 이전 주소 호환 (/archive/ → /newsletters/)
export const metadata = pageMetadata({ title: "주소 변경", path: "/newsletters/", noindex: true });

export default function LegacyPage() {
  return <LegacyRedirect to="/newsletters/" label="뉴스레터" />;
}
