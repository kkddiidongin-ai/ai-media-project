import Link from "next/link";
import { DarkCard, PageHead, Wrap } from "@/components/ui";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "뉴스레터 수신거부",
  description: "AI마중 뉴스레터 구독을 해지하는 방법을 안내합니다.",
  path: "/newsletter/unsubscribe/",
  noindex: true,
});

/**
 * 수신거부 안내. 실제 해지는 메일 하단의 '수신거부' 링크(Resend가 구독자별로 만드는 링크)로 처리한다.
 * 이 페이지에서 이메일만 받아 해지하면 다른 사람의 구독을 마음대로 끊을 수 있어서, 입력 폼을 두지 않는다.
 */
export default function UnsubscribePage() {
  return (
    <Wrap>
      <PageHead kicker="NEWSLETTER" title="뉴스레터 수신거부">
        <p>AI마중 뉴스레터는 언제든 구독을 해지할 수 있습니다.</p>
      </PageHead>
      <DarkCard className="space-y-4 px-5 py-6 text-[14.5px] leading-[1.75] text-night-text sm:px-8">
        <p>
          <strong>받은 메일 맨 아래의 ‘수신거부’ 링크</strong>를 누르면 바로 해지됩니다. 링크는 구독자마다 다르게 만들어지므로, 받은 메일에 있는 링크를 그대로 눌러 주세요.
        </p>
        <p className="text-night-muted">해지하면 다음 호부터 메일이 가지 않습니다. 해지한 뒤에도 웹사이트의 지난 뉴스레터는 계속 볼 수 있습니다.</p>
        <p className="text-night-muted">
          링크가 동작하지 않으면 받은 메일에 답장으로 알려 주시거나{" "}
          <Link href="/collab/#contact" className="underline underline-offset-4 hover:text-night-text">
            문의
          </Link>
          로 알려 주세요.
        </p>
      </DarkCard>
      <p className="mt-6 text-[14px]">
        <Link href="/newsletters/" className="font-semibold text-night-muted hover:text-night-text">
          ← 지난 뉴스레터 보기
        </Link>
      </p>
    </Wrap>
  );
}
