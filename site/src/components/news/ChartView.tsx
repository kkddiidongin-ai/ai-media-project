import Link from "next/link";
import { chartCategoryLabels } from "@/config/labels";
import { chartHref, formatDate, formatMonth, storyHref } from "@/lib/format";
import { getStory, monthlyCounts, type Chart, type ChartItem, type ChartSection } from "@/lib/news";

/**
 * 차트 그리기 (외부 라이브러리 없이 HTML/CSS).
 * - bar: 같은 기준의 숫자만 막대로 비교
 * - list: 기준이 서로 다른 숫자는 막대 없이 나열
 * - timeline: 날짜순 사건
 * - db-monthly: 이 사이트 DB에서 빌드 때 다시 세는 값
 */

const GROUP_TONE: Record<string, string> = {
  OpenAI: "bg-[#3b6f60]",
  Anthropic: "bg-[#8a6a3c]",
  Google: "bg-[#4d6488]",
  xAI: "bg-[#3d3d3d]",
  Meta: "bg-[#5b5487]",
  "Samsung·Google": "bg-[#2f6a86]",
};
const tone = (g?: string) => (g && GROUP_TONE[g]) || "bg-[#5d5a53]";

function Bars({ chart }: { chart: Chart }) {
  const items: ChartItem[] = chart.type === "db-monthly" ? monthlyCounts().map(([m, n]) => ({ label: formatMonth(m), value: n, display: `${n}건` })) : chart.items;
  const max = Math.max(...items.map((i) => i.value ?? 0), 1);
  return (
    <ul className="space-y-2.5">
      {items.map((it, idx) => (
        <li key={`${it.label}-${idx}`}>
          <div className="flex items-baseline justify-between gap-3 text-[13px]">
            <span className="font-bold text-ink">
              {it.label}
              {it.group ? <span className="ml-1.5 text-[11.5px] font-semibold text-muted">{it.group}</span> : null}
            </span>
            <span className="shrink-0 font-mono text-[12.5px] text-ink-soft">{it.display ?? it.value}</span>
          </div>
          <div className="mt-1 h-[10px] w-full rounded-[3px] bg-line/60">
            <div className={`h-full rounded-[3px] ${tone(it.group)}`} style={{ width: `${Math.max(2, ((it.value ?? 0) / max) * 100)}%` }} />
          </div>
          {it.note ? <p className="mt-0.5 text-[11.5px] text-muted">{it.note}</p> : null}
        </li>
      ))}
    </ul>
  );
}

function List({ chart }: { chart: Chart }) {
  return (
    <ul className="divide-y divide-line">
      {chart.items.map((it, idx) => (
        <li key={idx} className="grid gap-1 py-3 sm:grid-cols-[1fr_auto] sm:items-baseline sm:gap-4">
          <div>
            <p className="text-[14px] font-bold text-ink">
              {it.storySlug ? (
                <Link href={storyHref(it.storySlug)} className="hover:underline hover:underline-offset-4">
                  {it.label}
                </Link>
              ) : (
                it.label
              )}
            </p>
            {it.note ? <p className="text-[12.5px] text-muted">{it.note}</p> : null}
          </div>
          <div className="sm:text-right">
            <p className="text-[18px] font-extrabold tracking-[-0.01em] text-ink">{it.display}</p>
            {it.date ? <p className="font-mono text-[11.5px] text-muted">{formatDate(it.date)}</p> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

function Timeline({ chart }: { chart: Chart }) {
  const rows = chart.items
    .map((it) => ({ it, s: it.storySlug ? getStory(it.storySlug) : undefined }))
    .filter((r) => r.s)
    .sort((a, b) => a.s!.eventDate.localeCompare(b.s!.eventDate));
  return (
    <ol className="relative ml-2 border-l border-line-strong">
      {rows.map(({ it, s }) => (
        <li key={s!.slug} className="relative py-2 pl-5">
          <span aria-hidden className={`absolute -left-[5px] top-[15px] h-[9px] w-[9px] rounded-full ${tone(it.group)}`} />
          <p className="font-mono text-[11.5px] text-muted">
            {formatDate(s!.eventDate)} · {it.group}
          </p>
          <Link href={storyHref(s!.slug)} className="text-[14px] font-bold leading-snug text-ink hover:underline hover:underline-offset-4">
            {s!.title}
          </Link>
        </li>
      ))}
    </ol>
  );
}

export function ChartVisual({ chart }: { chart: Chart }) {
  if (chart.type === "bar" || chart.type === "db-monthly") return <Bars chart={chart} />;
  if (chart.type === "timeline") return <Timeline chart={chart} />;
  return <List chart={chart} />;
}

/** 차트 해설 한 덩어리 (상세 페이지). 주의 사항은 점선 상자로 구분한다 */
function ChartAnalysis({ sec }: { sec: ChartSection }) {
  const caution = sec.role === "caution";
  return (
    <section className={caution ? "mt-7 rounded-[6px] border border-dashed border-line-strong px-4 py-4" : "mt-7"}>
      {caution ? <p className="text-[11px] font-extrabold tracking-[0.08em] text-muted">주의</p> : null}
      <h2 className="mb-2.5 text-[17px] font-bold leading-snug text-ink">{sec.heading}</h2>
      {(sec.paragraphs ?? []).map((p) => (
        <p key={p} className="mt-2.5 text-[15px] leading-[1.85] text-ink first:mt-0">
          {p}
        </p>
      ))}
      {sec.bullets?.length ? (
        <ul className={`${sec.paragraphs?.length ? "mt-3" : ""} space-y-2 text-[14.5px] leading-[1.75] text-ink`}>
          {sec.bullets.map((b) => (
            <li key={b} className="flex gap-2.5">
              <span aria-hidden className="mt-[11px] h-1 w-1 shrink-0 rounded-full bg-ink" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/** 차트 한 편 (종이 면): NUMBER · CATEGORY · HEADLINE · 설명 · VISUAL · AI MEDIA POINT · SOURCE */
export function ChartBody({ chart, number, headingLevel = "h2" }: { chart: Chart; number?: number; headingLevel?: "h1" | "h2" }) {
  const H = headingLevel;
  return (
    <article className="px-6 py-7 sm:px-9">
      <p className="flex items-center gap-2 text-[11px] font-extrabold tracking-[0.08em] text-accent">
        {number !== undefined ? <span className="font-mono text-[12px] text-muted">{String(number).padStart(2, "0")}</span> : null}
        {chartCategoryLabels[chart.category] ?? chart.category}
      </p>
      <H className={`mt-2 font-bold leading-[1.35] tracking-[-0.01em] text-ink ${headingLevel === "h1" ? "text-[24px] sm:text-[28px]" : "text-[20px]"}`}>{chart.title}</H>
      {chart.oneLine ? (
        <p className="mt-3 border-l-2 border-ink pl-3 text-[15.5px] font-semibold leading-[1.7] text-ink">{chart.oneLine}</p>
      ) : (
        <p className="mt-2 text-[14.5px] leading-[1.7] text-ink-soft">{chart.summary}</p>
      )}

      <figure className="mt-5 rounded-[6px] border border-line bg-surface px-4 py-4">
        <figcaption className="mb-3 text-[11.5px] font-semibold text-muted">단위: {chart.unit}</figcaption>
        <ChartVisual chart={chart} />
      </figure>

      {chart.analysis?.length ? (
        headingLevel === "h1" ? (
          chart.analysis.map((sec) => <ChartAnalysis key={sec.heading} sec={sec} />)
        ) : (
          <Link href={chartHref(chart.slug)} className="mt-4 inline-block text-[13.5px] font-bold text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">
            숫자 해설 전체 보기 →
          </Link>
        )
      ) : null}

      <section className={`${chart.analysis?.length && headingLevel === "h1" ? "mt-8" : "mt-5"} border-l-2 border-accent pl-4`}>
        <h3 className="mb-1 text-[12px] font-extrabold tracking-[0.06em] text-accent">
          AI MEDIA POINT <span className="font-semibold text-muted">· 해석</span>
        </h3>
        <p className="text-[14.5px] leading-[1.75] text-ink">{chart.point}</p>
      </section>

      <div className="mt-5 rounded-[6px] border border-line bg-surface px-4 py-3 text-[12.5px] text-ink-soft">
        <p className="text-[11px] font-extrabold tracking-[0.08em] text-muted">SOURCE · CHECKED {formatDate(chart.checkedAt)}</p>
        <p className="mt-1.5 leading-relaxed">
          <span className="font-bold text-ink">비교 기준</span> · {chart.basis}
        </p>
        <ul className="mt-1.5 space-y-0.5">
          {chart.sources.map((s) => (
            <li key={s.url}>
              {s.url.startsWith("http") ? (
                <a href={s.url} className="underline decoration-line-strong underline-offset-2 hover:decoration-ink" rel="noopener noreferrer" target="_blank">
                  {s.name}
                </a>
              ) : (
                <Link href={s.url} className="underline decoration-line-strong underline-offset-2 hover:decoration-ink">
                  {s.name}
                </Link>
              )}
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}
