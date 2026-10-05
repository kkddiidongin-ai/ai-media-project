import Link from "next/link";
import { DarkCard, PageHead, SectionLabel, Wrap } from "@/components/ui";
import { siteConfig } from "@/config/site";
import { getIssues, getStories } from "@/lib/news";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "협업문의",
  description: "AI마중과 함께할 수 있는 콘텐츠 협업, AI 서비스 검증, 교육·강의, 기업 협업을 안내합니다.",
  path: "/collab/",
});

const OFFERS = [
  { k: "01", t: "콘텐츠 협업", d: "AI 관련 주제를 이 매체의 형식(뉴스레터·AI차트·카드뉴스)으로 함께 만듭니다. 협업 콘텐츠는 처음부터 협업 표시를 합니다." },
  { k: "02", t: "AI 서비스 검증", d: "AI 제품을 실제 사용 조건에서 써보고, 된 것과 안 된 것을 그대로 기록합니다. 결과를 미리 정해 두지 않습니다." },
  { k: "03", t: "AI 관련 프로젝트", d: "AI 도입 자료 조사, 공식 발표 모니터링, 사내용 AI 변화 브리핑처럼 이 매체가 매일 하는 일을 프로젝트로 함께합니다." },
  { k: "04", t: "교육·강의", d: "쌓인 기록을 바탕으로 기관·기업에 맞춘 AI 교육을 상의합니다. 정해진 강의 상품은 아직 없습니다." },
  { k: "05", t: "기업 협업", d: "그 밖의 형태도 열려 있습니다. 필요한 것을 알려주시면 가능한 범위를 솔직하게 말씀드립니다." },
];

const RULES = [
  "협업·광고·제휴 콘텐츠는 제목 근처에 반드시 표시합니다.",
  "협업사가 결론이나 평가를 정할 수 없습니다. 사실 확인과 문장은 편집 원칙을 따릅니다.",
  "확인되지 않은 성능·수익 주장은 싣지 않습니다.",
  "독자 개인정보를 협업사에 넘기지 않습니다. 지금은 회원 정보 자체를 받지 않습니다.",
];

const STEPS = ["메일로 문의를 주시면 내용을 확인합니다.", "가능 여부와 방식, 일정을 솔직하게 답합니다.", "제안서로 범위·표시 방식·일정을 합의합니다.", "발행 전 사실관계만 함께 확인하고, 표현과 평가는 편집 원칙을 따릅니다."];

/** Reference의 B2B 랜딩. 존재하지 않는 실적·고객사·숫자는 만들지 않는다. */
export default function CollabPage() {
  const stories = getStories().length;
  const issues = getIssues().length;
  return (
    <Wrap>
      <PageHead kicker="PARTNERSHIP" title={<>AI의 변화를, 확인한 만큼만<br />함께 전합니다</>}>
        <p>{siteConfig.description}</p>
      </PageHead>

      <section aria-labelledby="c-about">
        <SectionLabel>
          <span id="c-about">AI마중은 이런 매체입니다</span>
        </SectionLabel>
        <DarkCard className="space-y-3 px-5 py-5 text-[14px] leading-relaxed text-night-text">
          <p>
            <strong className="text-night-accent">공식 원문 우선.</strong> OpenAI, Anthropic, Google 등 회사의 공식 발표를 먼저 확인하고, 원문 링크와 날짜를 모든 기사에 남깁니다.
          </p>
          <p>
            <strong className="text-night-accent">&lsquo;그래서 나한테 뭐가 달라지는데?&rsquo;</strong> 기술 설명보다 일과 생활에서 무엇이 바뀌는지를 먼저 씁니다.
          </p>
          <p>
            <strong className="text-night-accent">지금까지의 기록.</strong> 2026년 1월부터 공식 원문으로 확인한 AI 사건 {stories}건, 뉴스레터 {issues}호를 정리했습니다. (독자 수·구독자 수 같은 실적은 아직 공개하지 않습니다.)
          </p>
        </DarkCard>
      </section>

      <section className="mt-10" aria-labelledby="c-readers">
        <SectionLabel>
          <span id="c-readers">어떤 독자를 위한 매체인가</span>
        </SectionLabel>
        <DarkCard className="px-5 py-5 text-[14px] leading-relaxed text-night-text">
          AI 전문가나 개발자가 아니라, AI를 일과 생활에 써보려는 사람들입니다. 직장인, 자영업자, 프리랜서, 그리고 AI 뉴스는 많은데 무엇이 중요한지 고르기 어려운 사람들을 위해 씁니다.
        </DarkCard>
      </section>

      <section className="mt-10" aria-labelledby="c-offers">
        <SectionLabel>
          <span id="c-offers">이렇게 함께할 수 있습니다</span>
        </SectionLabel>
        <div className="grid gap-3 sm:grid-cols-2">
          {OFFERS.map((o) => (
            <div key={o.k} className="rounded-[10px] border border-night-line bg-night-raise px-5 py-4">
              <p className="font-mono text-[12px] font-bold text-night-accent">{o.k}</p>
              <p className="mt-1 font-bold text-night-text">{o.t}</p>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-night-muted">{o.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10" aria-labelledby="c-rules">
        <SectionLabel>
          <span id="c-rules">이것만은 미리 말씀드립니다 (편집 원칙)</span>
        </SectionLabel>
        <DarkCard className="px-5 py-5">
          <ul className="space-y-2 text-[14px] leading-relaxed text-night-text">
            {RULES.map((r) => (
              <li key={r} className="flex gap-2">
                <span aria-hidden className="text-night-accent">·</span>
                {r}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[13px] text-night-muted">
            자세한 원칙은{" "}
            <Link href="/method/" className="font-semibold text-night-accent underline underline-offset-4">
              편집·출처 원칙
            </Link>
            에 있습니다.
          </p>
        </DarkCard>
      </section>

      <section className="mt-10" aria-labelledby="c-steps">
        <SectionLabel>
          <span id="c-steps">진행은 이렇게</span>
        </SectionLabel>
        <ol className="space-y-2">
          {STEPS.map((s, i) => (
            <li key={s} className="flex gap-3 rounded-[10px] border border-night-line bg-night-raise px-5 py-3 text-[14px] text-night-text">
              <span className="font-mono text-[13px] font-bold text-night-accent">{i + 1}</span>
              {s}
            </li>
          ))}
        </ol>
      </section>

      <section id="contact" className="mt-10 scroll-mt-28" aria-labelledby="c-contact">
        <DarkCard className="px-6 py-8 text-center">
          <h2 id="c-contact" className="text-[20px] font-bold text-white">
            가볍게 물어보셔도 됩니다
          </h2>
          <p className="mt-2 text-[14px] leading-relaxed text-night-muted">예산이나 일정이 정해지지 않았어도 괜찮습니다. 오류 제보도 같은 곳으로 받습니다.</p>
          {siteConfig.contactEmail ? (
            <a href={`mailto:${siteConfig.contactEmail}`} className="mt-5 inline-block rounded-full bg-night-accent px-6 py-3 font-bold text-night-deep">
              {siteConfig.contactEmail}
            </a>
          ) : (
            <p className="mt-5 inline-block rounded-full border border-dashed border-night-line px-6 py-3 text-[14px] text-night-muted">
              문의 메일 주소 준비 중
            </p>
          )}
        </DarkCard>
      </section>
    </Wrap>
  );
}
