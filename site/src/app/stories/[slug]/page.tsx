import Link from "next/link";
import { notFound } from "next/navigation";
import { StoryBody, StoryRow } from "@/components/news/Story";
import { DarkCard, PaperCard, SectionLabel, Wrap } from "@/components/ui";
import { getStories, getStory, getTopic, storiesForTopic } from "@/lib/news";
import { formatDate, issueHref, topicHref } from "@/lib/format";
import { pageMetadata, storyJsonLd } from "@/lib/seo";

export const dynamicParams = false;

export function generateStaticParams() {
  return getStories().map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: PageProps<"/stories/[slug]">) {
  const { slug } = await params;
  const s = getStory(slug);
  if (!s) return {};
  return pageMetadata({ title: s.title, description: s.summary, path: `/stories/${s.slug}/`, type: "article", publishedTime: s.publishedAt, modifiedTime: s.updatedAt });
}

export default async function StoryPage({ params }: PageProps<"/stories/[slug]">) {
  const { slug } = await params;
  const s = getStory(slug);
  if (!s) notFound();
  const mainTopic = s.topics[0];
  const related = mainTopic
    ? storiesForTopic(mainTopic)
        .filter((x) => x.slug !== s.slug)
        .slice(0, 5)
    : [];

  return (
    <Wrap className="pt-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(storyJsonLd(s)) }} />
      <p className="mb-3 flex flex-wrap gap-x-3 text-[13px] text-night-muted">
        <Link href={issueHref(s.eventDate)} className="hover:text-night-text">
          ← {formatDate(s.eventDate)} 뉴스레터
        </Link>
      </p>
      <PaperCard>
        <p className="border-b border-line bg-surface px-6 py-3 font-mono text-[12.5px] text-muted sm:px-9">
          {formatDate(s.eventDate)} 발표 · {s.sourceName}
        </p>
        <StoryBody s={s} headingLevel="h1" />
      </PaperCard>

      {related.length > 0 && mainTopic ? (
        <section className="mt-10" aria-labelledby="related">
          <SectionLabel href={topicHref(mainTopic)} more={`${getTopic(mainTopic)?.name} 전체`}>
            <span id="related">같은 주제 · {getTopic(mainTopic)?.name}</span>
          </SectionLabel>
          <DarkCard className="divide-y divide-night-line px-5">
            {related.map((x) => (
              <StoryRow key={x.slug} s={x} />
            ))}
          </DarkCard>
        </section>
      ) : null}
    </Wrap>
  );
}
