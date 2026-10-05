import { LegacyRedirect } from "@/components/shell/LegacyRedirect";
import { pageMetadata } from "@/lib/seo";

// Phase 6 이전 주소 호환 (/tasks/ → /topics/)
export const metadata = pageMetadata({ title: "주소 변경", path: "/topics/", noindex: true });

export default function LegacyPage() {
  return <LegacyRedirect to="/topics/" label="주제별" />;
}
