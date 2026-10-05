import Link from "next/link";
import { notFound } from "next/navigation";
import { StoryRow } from "@/components/news/Story";
import { Badge, DarkCard, SectionLabel, Wrap } from "@/components/ui";
import { demoLabel } from "@/config/labels";
import { siteConfig } from "@/config/site";
import { getCard, getCardnews, getStory } from "@/lib/news";
import { cardHref, formatDate } from "@/lib/format";
import { pageMetadata } from "@/lib/seo";

export const dynamicParams = false;

export function generateStaticParams() {
  return getCardnews().map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: PageProps<"/cardnews/[slug]">) {
  const { slug } = await params;
  const c = getCard(slug);
  if (!c) return {};
  return pageMetadata({ title: c.title, description: c.summary, path: cardHref(c.slug), noindex: c.demo });
}

export default async function CardDetailPage({ params }: PageProps<"/cardnews/[slug]">) {
  const { slug } = await params;
  const c = getCard(slug);
  if (!c) notFound();
  const sources = c.storySlugs.map((s) => getStory(s)).filter((s) => s !== undefined);

  return (
    <Wrap className="pt-8">
      <p className="mb-3 text-[13px]">
        <Link href="/cardnews/" className="text-night-muted hover:text-night-text">
          ← 카드뉴스 전체
        </Link>
      </p>
      <header className="mb-6">
        <p className="flex items-center gap-2 font-mono text-[12.5px] text-night-muted">
          {formatDate(c.publishedAt)} {c.demo ? <Badge tone="amber">{demoLabel}</Badge> : null}
        </p>
        <h1 className="mt-2 text-[24px] font-bold leading-snug text-white sm:text-[28px]">{c.title}</h1>
        <p className="mt-2 text-[14.5px] text-night-muted">{c.summary}</p>
      </header>

      {/* 카드: 모바일은 가로로 넘기고, 넓은 화면은 2열 */}
      <ol className="-mx-[18px] flex snap-x snap-mandatory gap-3 overflow-x-auto px-[18px] pb-3 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0">
        {c.slides.map((s, i) => (
          <li
            key={i}
            className={`flex aspect-square w-[82%] shrink-0 snap-center flex-col justify-between rounded-[12px] border p-6 sm:w-auto ${
              i === 0 ? "border-night-accent/40 bg-[#1f2b26]" : "border-line bg-paper text-ink"
            }`}
          >
            <p className={`text-[12px] font-extrabold tracking-[0.06em] ${i === 0 ? "text-night-accent" : "text-accent"}`}>{s.kicker}</p>
            <div>
              <p className={`text-[22px] font-bold leading-[1.3] tracking-[-0.02em] ${i === 0 ? "text-white" : "text-ink"}`}>{s.title}</p>
              <p className={`mt-3 text-[14px] leading-relaxed ${i === 0 ? "text-night-text" : "text-ink-soft"}`}>{s.body}</p>
            </div>
            <p className={`flex justify-between font-mono text-[11px] ${i === 0 ? "text-night-muted" : "text-muted"}`}>
              <span>{siteConfig.shortName}</span>
              <span>
                {i + 1}/{c.slides.length}
              </span>
            </p>
          </li>
        ))}
      </ol>

      <section className="mt-10" aria-labelledby="card-src">
        <SectionLabel>
          <span id="card-src">이 카드뉴스의 원천 기사</span>
        </SectionLabel>
        <DarkCard className="divide-y divide-night-line px-5">
          {sources.map((s) => (
            <StoryRow key={s!.slug} s={s!} />
          ))}
        </DarkCard>
      </section>
    </Wrap>
  );
}
