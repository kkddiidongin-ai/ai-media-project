import Link from "next/link";
import { Badge, DarkCard, PageHead, SectionLabel, Wrap } from "@/components/ui";
import { comingSoonLabel } from "@/config/labels";
import { getCharts, getStories, getTopics } from "@/lib/news";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "AI강의",
  description: "AI MEDIA에 쌓인 뉴스·차트·활용 사례를 바탕으로 한 AI 교육을 준비하고 있습니다.",
  path: "/school/",
  noindex: true,
});

/** Reference의 '미디어 → 교육' 확장. 강의·후기·수강생 숫자를 만들지 않는다. */
export default function SchoolPage() {
  const stories = getStories().length;
  const charts = getCharts().length;
  const topics = getTopics().length;
  const blocks = [
    { t: "뉴스", d: `날짜별로 확인한 AI 변화 ${stories}건이 쌓여 있습니다. 강의는 '요즘 무엇이 바뀌었나'를 이 기록에서 시작합니다.`, href: "/newsletters/" },
    { t: "AI차트", d: `가격·투자·모델 출시처럼 숫자로 봐야 하는 흐름 ${charts}개를 정리했습니다. 강의 자료의 근거가 됩니다.`, href: "/chart/" },
    { t: "주제별 아카이브", d: `${topics}개 주제로 묶인 타임라인은 '내 일에 필요한 AI만 골라 배우는' 커리큘럼의 뼈대가 됩니다.`, href: "/topics/" },
    { t: "직접 해본 활용 사례", d: "AI MEDIA가 직접 실험한 콘텐츠(직접 해봄·오래 써보기·주장 확인)는 아직 발행 전입니다. 실험 결과가 쌓이면 실습 강의로 연결합니다.", href: "/method/" },
  ];
  return (
    <Wrap>
      <PageHead kicker="미디어에서 교육으로" title="AI강의" badge={<Badge tone="amber">{comingSoonLabel}</Badge>}>
        <p>아직 열린 강의가 없습니다. 강의 목록, 수강 후기, 수강생 수를 만들어 보여주지 않습니다.</p>
      </PageHead>

      <section aria-labelledby="school-base">
        <SectionLabel>
          <span id="school-base">강의는 이 기록에서 출발합니다</span>
        </SectionLabel>
        <div className="grid gap-3 sm:grid-cols-2">
          {blocks.map((b) => (
            <Link key={b.t} href={b.href} className="block rounded-[10px] border border-night-line bg-night-raise px-5 py-4 hover:border-night-muted">
              <p className="font-bold text-night-text">{b.t}</p>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-night-muted">{b.d}</p>
            </Link>
          ))}
        </div>
      </section>

      <DarkCard className="mt-10 px-5 py-5">
        <p className="text-[14px] font-bold text-night-text">기관·기업 교육이 필요하신가요?</p>
        <p className="mt-1 text-[13.5px] leading-relaxed text-night-muted">
          정해진 강의 상품은 아직 없습니다. 필요한 내용을 알려주시면 가능한 범위를 솔직하게 말씀드립니다.{" "}
          <Link href="/collab/#contact" className="font-semibold text-night-accent underline underline-offset-4">
            협업문의
          </Link>
        </p>
      </DarkCard>
    </Wrap>
  );
}
