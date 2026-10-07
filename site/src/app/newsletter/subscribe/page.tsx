import Link from "next/link";
import { SubscribeForm } from "@/components/newsletter/SubscribeForm";
import { DarkCard, PageHead, Wrap } from "@/components/ui";
import { siteConfig } from "@/config/site";
import { getIssues } from "@/lib/news";
import { formatDate, issueHref } from "@/lib/format";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "뉴스레터 구독",
  description: "매일 쏟아지는 AI 소식 중 지금 알아야 할 변화만 골라 쉽게 정리해 보내드립니다. AI마중 뉴스레터를 이메일로 받아보세요.",
  path: "/newsletter/subscribe/",
});

/** 메일에 들어가는 순서 (scripts/newsletter/render.mjs의 구성과 같다) */
const parts = [
  ["☀️ 오늘의 AI", "그날 확인한 주요 소식을 한눈에"],
  ["🔥 오늘의 메인", "가장 중요한 변화 하나를 조금 더 자세히"],
  ["⚡ 놓치면 아쉬운 변화", "나머지 소식을 짧게"],
  ["📌 AI마중 POINT", "그래서 무엇이 달라지는지"],
  ["📚 더 읽어보기", "이어서 읽을 만한 지난 기사"],
] as const;

export default function SubscribePage() {
  const latest = getIssues()[0];
  return (
    <Wrap>
      <PageHead kicker="NEWSLETTER" title="AI마중 뉴스레터">
        <p className="text-[17px] font-bold text-night-text">{siteConfig.descriptor}</p>
        <p className="mt-2">매일 쏟아지는 AI 소식 중 지금 알아야 할 변화만 골라 쉽게 정리해 보내드립니다.</p>
        <p className="mt-2 text-night-accent">{siteConfig.tagline}</p>
      </PageHead>

      <DarkCard className="px-5 py-6 sm:px-8 sm:py-8">
        <SubscribeForm />
      </DarkCard>

      <section aria-labelledby="nl-parts" className="mt-12">
        <h2 id="nl-parts" className="mb-4 text-[12px] font-extrabold tracking-[0.08em] text-night-accent">
          메일에는 이렇게 담깁니다
        </h2>
        <ul className="divide-y divide-night-line rounded-[10px] border border-night-line">
          {parts.map(([title, desc]) => (
            <li key={title} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 py-3.5 text-[14px]">
              <span className="font-bold text-night-text">{title}</span>
              <span className="text-night-muted">{desc}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[13px] leading-relaxed text-night-muted">
          모든 소식은 공식 원문과 출처를 함께 적습니다. 확인한 사실만 쓰고, 확인하지 못한 내용은 확인하지 못했다고 씁니다.
        </p>
      </section>

      <section aria-labelledby="nl-past" className="mt-12">
        <h2 id="nl-past" className="mb-3 text-[12px] font-extrabold tracking-[0.08em] text-night-accent">
          먼저 읽어보기
        </h2>
        <div className="flex flex-wrap gap-2 text-[14px] font-semibold">
          {latest ? (
            <Link href={issueHref(latest.date)} className="rounded-[8px] border border-night-line bg-night-raise px-4 py-2.5 text-night-text hover:border-night-muted">
              최신호 보기 · {formatDate(latest.date)}
            </Link>
          ) : null}
          <Link href="/newsletters/" className="rounded-[8px] border border-night-line bg-night-raise px-4 py-2.5 text-night-text hover:border-night-muted">
            지난 뉴스레터 전체 →
          </Link>
        </div>
        <p className="mt-6 text-[13px] text-night-muted">
          구독을 그만두고 싶다면 <Link href="/newsletter/unsubscribe/" className="underline underline-offset-4 hover:text-night-text">수신거부 안내</Link>를 확인해 주세요.
        </p>
      </section>
    </Wrap>
  );
}
