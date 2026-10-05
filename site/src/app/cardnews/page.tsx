import Link from "next/link";
import { PageHead, Wrap } from "@/components/ui";
import { demoLabel } from "@/config/labels";
import { getCardnews } from "@/lib/news";
import { cardHref, formatDate } from "@/lib/format";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "카드뉴스",
  description: "뉴스레터의 실제 기사를 주제별 흐름으로 묶어 짧은 카드로 다시 정리합니다. 모든 카드에 원천 기사가 연결돼 있습니다.",
  path: "/cardnews/",
});

/** Reference의 카드뉴스 목록: 날짜 → 카드 한 줄. 실제 기사에서만 만든다. */
export default function CardnewsPage() {
  const cards = getCardnews();
  const days = new Map<string, typeof cards>();
  for (const c of cards) {
    if (!days.has(c.publishedAt)) days.set(c.publishedAt, []);
    days.get(c.publishedAt)!.push(c);
  }
  return (
    <Wrap>
      <PageHead kicker="한 장씩 넘겨 보는 AI" title="카드뉴스">
        <p>
          뉴스레터의 실제 기사 여러 건을 하나의 흐름으로 묶어 {cards.length}편의 카드로 다시 정리했습니다. 카드 문장은 새로 썼고, 모든 사실은 연결된 원천 기사와 그 공식 원문에서 나옵니다.
        </p>
      </PageHead>
      <div className="space-y-8">
        {[...days.entries()].map(([d, list]) => (
          <section key={d}>
            <h2 className="mb-2 font-mono text-[13px] font-semibold text-night-muted">{formatDate(d)}</h2>
            <ul className="space-y-2">
              {list.map((c) => (
                <li key={c.slug}>
                  <Link href={cardHref(c.slug)} className="flex items-center gap-3 rounded-[8px] border border-night-line bg-night-raise px-4 py-3 hover:border-night-muted">
                    {c.demo ? <span className="rounded-[4px] bg-amber-soft px-1.5 py-0.5 font-mono text-[10.5px] font-extrabold text-amber">{demoLabel}</span> : null}
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14.5px] font-bold text-white">{c.title}</span>
                      <span className="mt-0.5 block text-[12.5px] leading-snug text-night-muted">{c.summary}</span>
                    </span>
                    <span className="shrink-0 font-mono text-[12px] text-night-muted">{c.slides.length}장</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Wrap>
  );
}
