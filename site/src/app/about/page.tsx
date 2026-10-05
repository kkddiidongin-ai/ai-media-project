import Link from "next/link";
import { DarkCard, PageHead, Wrap } from "@/components/ui";
import { siteConfig } from "@/config/site";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({ title: "소개", path: "/about/" });

export default function AboutPage() {
  return (
    <Wrap>
      <PageHead kicker="ABOUT" title={siteConfig.name}>
        <p>{siteConfig.tagline}</p>
      </PageHead>
      <DarkCard className="space-y-3 px-5 py-5 text-[14.5px] leading-relaxed text-night-text">
        <p>{siteConfig.description}</p>
        <p>
          AI 관련 뉴스는 매일 쏟아지지만, 무엇이 실제로 바뀐 것이고 나와 무슨 상관인지 고르기는 어렵습니다. 이 사이트는 AI 회사들의 공식 발표를 날짜별로 확인하고, 사실과 해석을 나눠 짧게 정리합니다.
        </p>
        <p className="text-night-muted">
          브랜드명은 아직 정하지 않은 임시 이름입니다. 운영: {siteConfig.operator.name}. 공개 전 미리보기 단계입니다.
        </p>
      </DarkCard>
      <p className="mt-6 text-[14px] text-night-muted">
        어떻게 확인하는지는{" "}
        <Link href="/method/" className="font-semibold text-night-accent underline underline-offset-4">
          편집·출처 원칙
        </Link>
        , 문의는{" "}
        <Link href="/collab/#contact" className="font-semibold text-night-accent underline underline-offset-4">
          협업문의
        </Link>
        에서 볼 수 있습니다.
      </p>
    </Wrap>
  );
}
