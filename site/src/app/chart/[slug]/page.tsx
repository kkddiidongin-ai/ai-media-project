import Link from "next/link";
import { notFound } from "next/navigation";
import { ChartBody } from "@/components/news/ChartView";
import { StoryRow } from "@/components/news/Story";
import { DarkCard, PaperCard, SectionLabel, Wrap } from "@/components/ui";
import { getChart, getCharts, getStory } from "@/lib/news";
import { chartHref } from "@/lib/format";
import { pageMetadata } from "@/lib/seo";

export const dynamicParams = false;

export function generateStaticParams() {
  return getCharts().map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: PageProps<"/chart/[slug]">) {
  const { slug } = await params;
  const c = getChart(slug);
  if (!c) return {};
  return pageMetadata({ title: c.title, description: c.summary, path: chartHref(c.slug), type: "article", publishedTime: c.publishedAt, modifiedTime: c.checkedAt });
}

export default async function ChartDetailPage({ params }: PageProps<"/chart/[slug]">) {
  const { slug } = await params;
  const all = getCharts();
  const idx = all.findIndex((c) => c.slug === slug);
  if (idx < 0) notFound();
  const chart = all[idx];
  const related = chart.relatedStories.map((s) => getStory(s)).filter((s) => s !== undefined);

  return (
    <Wrap className="pt-8">
      <p className="mb-3 text-[13px]">
        <Link href="/chart/" className="text-night-muted hover:text-night-text">
          ← AI차트 전체
        </Link>
      </p>
      <PaperCard>
        <ChartBody chart={chart} number={idx + 1} headingLevel="h1" />
      </PaperCard>

      {related.length > 0 ? (
        <section className="mt-10" aria-labelledby="chart-stories">
          <SectionLabel>
            <span id="chart-stories">이 차트의 바탕이 된 기사</span>
          </SectionLabel>
          <DarkCard className="divide-y divide-night-line px-5">
            {related.map((s) => (
              <StoryRow key={s!.slug} s={s!} />
            ))}
          </DarkCard>
        </section>
      ) : null}
    </Wrap>
  );
}
