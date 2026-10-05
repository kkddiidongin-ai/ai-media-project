import Link from "next/link";
import { PageHead, Wrap } from "@/components/ui";
import { topicKindLabels } from "@/config/labels";
import { getStories, latestKeyStory, topicCounts } from "@/lib/news";
import { formatDate, storyHref, topicHref } from "@/lib/format";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "주제별",
  description: "2026년 AI 기사를 회사·제품·분야별로 다시 묶은 지식 아카이브입니다. 주제마다 기사 수, 최근 업데이트, 최근 핵심 기사를 보여줍니다.",
  path: "/topics/",
});

/** 주제별 Knowledge Archive: 분류(회사·제품·분야) → 주제 카드(설명·기사 수·최근 업데이트·최근 핵심 기사) */
export default function TopicsPage() {
  const counts = topicCounts();
  const total = getStories().length;
  const kinds = ["company", "product", "theme"] as const;

  return (
    <Wrap>
      <PageHead kicker="KNOWLEDGE ARCHIVE" title="주제별">
        <p>
          기사 {total}건을 {counts.length}개 주제로 다시 묶었습니다. 숫자는 이 사이트가 공식 원문으로 확인해 기록한 기사 수이고, 한 기사는 여러 주제에 함께 들어갈 수 있습니다.
        </p>
        <nav aria-label="분류 바로가기" className="mt-3 flex flex-wrap gap-2 text-[13px]">
          {kinds.map((k) => (
            <a key={k} href={`#k-${k}`} className="rounded-full border border-night-line px-3 py-1 font-semibold text-night-muted hover:text-night-text">
              {topicKindLabels[k]} {counts.filter((c) => c.topic.kind === k).length}
            </a>
          ))}
        </nav>
      </PageHead>

      <div className="space-y-10">
        {kinds.map((k) => (
          <section key={k} aria-labelledby={`k-${k}`}>
            <h2 id={`k-${k}`} className="mb-3 scroll-mt-40 text-[15px] font-bold text-white">
              {topicKindLabels[k]}
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              {counts
                .filter((c) => c.topic.kind === k)
                .map(({ topic, count, latest }) => {
                  const key = latestKeyStory(topic.slug);
                  return (
                    <li key={topic.slug} className="flex flex-col rounded-[8px] border border-night-line bg-night-raise px-4 py-3.5">
                      <div className="flex items-baseline justify-between gap-2">
                        <h3 className="text-[16px] font-bold text-white">
                          <Link href={topicHref(topic.slug)} className="hover:underline hover:underline-offset-4">
                            {topic.name}
                          </Link>
                        </h3>
                        <span className="shrink-0 font-mono text-[13px] font-bold text-night-accent">{count}건</span>
                      </div>
                      <p className="mt-1 text-[12.5px] leading-snug text-night-muted">{topic.description}</p>
                      {key ? (
                        <p className="mt-2.5 border-t border-night-line pt-2.5 text-[13px] leading-snug">
                          <span className="block text-[11px] font-extrabold tracking-[0.06em] text-night-muted">최근 핵심 기사</span>
                          <Link href={storyHref(key.slug)} className="font-semibold text-night-text hover:underline hover:underline-offset-4">
                            {key.title}
                          </Link>
                        </p>
                      ) : null}
                      <p className="mt-auto pt-2 font-mono text-[11.5px] text-night-muted">최근 업데이트 {latest ? formatDate(latest) : "-"}</p>
                    </li>
                  );
                })}
            </ul>
          </section>
        ))}
      </div>

      <p className="mt-10 rounded-[8px] border border-dashed border-night-line px-4 py-3 text-[12.5px] leading-relaxed text-night-muted">
        xAI(Grok)는 회사 뉴스 페이지가 자동 수집을 막고 있어, 공개된 xAI 개발자 문서의 릴리스 노트와 다른 회사의 공식 발표(GitHub, AWS 등)로 기록합니다. Perplexity는 공식 사이트를 직접 수집하지 않고, 다른 공식
        발표에 등장한 경우만 기록합니다.
      </p>
    </Wrap>
  );
}
