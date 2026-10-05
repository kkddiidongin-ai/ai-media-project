import { LegacyRedirect } from "@/components/shell/LegacyRedirect";
import { pageMetadata } from "@/lib/seo";

// Phase 6 이전 주소 호환 (/record/ → /method/)
export const metadata = pageMetadata({ title: "주소 변경", path: "/method/", noindex: true });

export default function LegacyPage() {
  return <LegacyRedirect to="/method/" label="편집·출처 원칙" />;
}
