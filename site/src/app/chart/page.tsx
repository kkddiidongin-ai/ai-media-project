import Link from "next/link";
import { ChartVisual } from "@/components/news/ChartView";
import { DarkCard, PageHead, PaperCard, Wrap } from "@/components/ui";
import { chartCategoryLabels } from "@/config/labels";
import { getChartDays } from "@/lib/news";
import { chartHref, formatDate } from "@/lib/format";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "AI차트",
  description: "AI의 가격, 투자, 컴퓨팅, 모델 출시 흐름을 공식 출처 숫자로 다시 그렸습니다. 모든 차트에 출처와 확인일을 적습니다.",
  path: "/chart/",
});

/** Reference의 날짜별 차트: 날짜 → 그날의 핵심 차트 → 나머지 차트 목록 */
export default function ChartPage() {
  const days = getChartDays();
  return (
    <Wrap>
      <PageHead kicker="숫자로 다시 보는 AI" title="AI차트">
        <p>뉴스 속 숫자와 관계를 한 장으로 다시 정리합니다. 공식 출처에서 숫자를 확인할 수 있는 것만 그리고, 기준이 다른 숫자는 같은 막대에 올리지 않습니다.</p>
      </PageHead>

      <div className="space-y-10">
        {days.map(({ date, charts }) => {
          const [lead, ...rest] = charts;
          return (
            <section key={date} aria-labelledby={`d-${date}`} className="rounded-[12px] border border-night-line bg-night-raise p-4 sm:p-6">
              <h2 id={`d-${date}`} className="mb-4 flex items-center gap-2 font-mono text-[13px] font-semibold text-night-text">
                {formatDate(date)} <span className="font-sans text-[12px] font-normal text-night-muted">{charts.length}개 차트</span>
              </h2>
              <PaperCard>
                <Link href={chartHref(lead.slug)} className="block px-6 py-6 hover:bg-surface sm:px-8">
                  <p className="text-[11px] font-extrabold tracking-[0.08em] text-accent">오늘의 핵심 차트 · {chartCategoryLabels[lead.category] ?? lead.category}</p>
                  <h3 className="mt-1.5 text-[20px] font-bold leading-snug text-ink">{lead.title}</h3>
                  <div className="mt-4">
                    <ChartVisual chart={lead} />
                  </div>
                </Link>
              </PaperCard>
              {rest.length > 0 ? (
                <DarkCard className="mt-3 divide-y divide-night-line border-night-line bg-night">
                  {rest.map((c, i) => (
                    <Link key={c.slug} href={chartHref(c.slug)} className="flex items-baseline gap-3 px-4 py-3.5 hover:bg-night-raise">
                      <span className="font-mono text-[12px] text-night-muted">{String(i + 2).padStart(2, "0")}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[11px] font-extrabold tracking-[0.08em] text-night-accent">{chartCategoryLabels[c.category] ?? c.category}</span>
                        <span className="block text-[15px] font-bold leading-snug text-night-text">{c.title}</span>
                      </span>
                    </Link>
                  ))}
                </DarkCard>
              ) : null}
            </section>
          );
        })}
      </div>
    </Wrap>
  );
}
