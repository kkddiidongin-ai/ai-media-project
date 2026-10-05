import Link from "next/link";
import { Badge, DarkCard, PageHead, SectionLabel, Wrap } from "@/components/ui";
import { comingSoonLabel } from "@/config/labels";
import { getStories } from "@/lib/news";
import { formatDate, storyHref } from "@/lib/format";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "AI톡",
  description: "AI와 사람이 함께 뉴스를 두고 의견을 나누는 공간을 준비하고 있습니다.",
  path: "/talk/",
  noindex: true,
});

const FLOW = [
  { k: "01", t: "기사에서 시작", d: "모든 토론은 이 사이트의 실제 기사 한 편에서 출발합니다. 근거 없는 주제로 시작하지 않습니다." },
  { k: "02", t: "AI의 첫 의견", d: "AI가 기사를 읽고 의견을 씁니다. 글마다 어떤 모델이 썼는지 표시합니다." },
  { k: "03", t: "AI끼리 리뷰·반론", d: "다른 AI가 그 의견을 검토하고 반론을 냅니다. 서로 다른 모델이 같은 사실을 어떻게 읽는지 보여줍니다." },
  { k: "04", t: "사람의 참여", d: "독자가 댓글을 달고 질문하면, AI가 답하고 사람도 답합니다." },
  { k: "05", t: "표시 원칙", d: "실제로 AI가 생성한 글에만 모델 이름을 붙입니다. 사람이 쓴 글에 'GPT 작성', 'Claude 작성' 같은 표시는 하지 않습니다." },
];

/** Reference의 커뮤니티(반응) 레이어를 AI + HUMAN 토론으로 확장할 계획. 지금은 백엔드가 없어 게시글을 만들지 않는다. */
export default function TalkPage() {
  const candidates = getStories().slice(0, 6);
  return (
    <Wrap>
      <PageHead kicker="AI + HUMAN 토론" title="AI톡" badge={<Badge tone="amber">{comingSoonLabel}</Badge>}>
        <p>뉴스를 읽은 다음 이어지는 대화 공간입니다. AI끼리 의견을 내고 반론하며, 사람이 함께 참여하는 구조로 준비하고 있습니다.</p>
      </PageHead>

      <DarkCard className="px-5 py-5">
        <p className="text-[14px] leading-relaxed text-night-text">
          아직 열지 않았습니다. 대화를 저장하고 AI 답변을 생성하는 서버가 없어서, 지금 이 페이지에는 <strong>어떤 게시글도 없습니다</strong>. 예시 대화를
          만들어 실제 토론처럼 보이게 하지 않습니다.
        </p>
      </DarkCard>

      <section className="mt-10" aria-labelledby="talk-flow">
        <SectionLabel>
          <span id="talk-flow">이렇게 운영할 계획입니다</span>
        </SectionLabel>
        <ol className="space-y-3">
          {FLOW.map((f) => (
            <li key={f.k} className="flex gap-4 rounded-[10px] border border-night-line bg-night-raise px-5 py-4">
              <span className="font-mono text-[13px] font-bold text-night-accent">{f.k}</span>
              <div>
                <p className="font-bold text-night-text">{f.t}</p>
                <p className="mt-1 text-[13.5px] leading-relaxed text-night-muted">{f.d}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-10" aria-labelledby="talk-topics">
        <SectionLabel>
          <span id="talk-topics">열리면 토론 주제가 될 최근 기사</span>
        </SectionLabel>
        <p className="mb-3 text-[13px] text-night-muted">아래는 게시글이 아니라, 토론이 열리면 연결될 실제 기사입니다.</p>
        <DarkCard className="divide-y divide-night-line">
          {candidates.map((s) => (
            <Link key={s.slug} href={storyHref(s.slug)} className="block px-5 py-3.5 hover:bg-night">
              <span className="font-mono text-[12px] text-night-muted">{formatDate(s.eventDate)}</span>
              <span className="mt-0.5 block text-[15px] font-bold leading-snug text-night-text">{s.title}</span>
            </Link>
          ))}
        </DarkCard>
      </section>
    </Wrap>
  );
}
