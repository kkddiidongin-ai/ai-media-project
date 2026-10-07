import { ConfirmClient } from "@/components/newsletter/ConfirmClient";
import { PageHead, Wrap } from "@/components/ui";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "뉴스레터 구독 확인",
  description: "AI마중 뉴스레터 구독을 확인합니다.",
  path: "/newsletter/confirm/",
  noindex: true,
});

/** 구독 확인 메일의 버튼이 여는 페이지. 토큰은 주소의 # 뒤에 있어 서버로 전송·기록되지 않고, 페이지가 확인 API로 보낸다 */
export default function ConfirmPage() {
  return (
    <Wrap>
      <PageHead kicker="NEWSLETTER" title="뉴스레터 구독 확인" />
      <ConfirmClient />
    </Wrap>
  );
}
