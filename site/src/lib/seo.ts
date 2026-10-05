import type { Metadata } from "next";
import { siteConfig } from "@/config/site";
import type { Story } from "./news";

interface PageMetaInput {
  title?: string;
  description?: string;
  path: string;
  /** DEMO·COMING SOON·검색·개인 보관함 등 색인하지 않을 페이지 */
  noindex?: boolean;
  type?: "website" | "article";
  publishedTime?: string;
  modifiedTime?: string;
}

/** 모든 페이지 공통 메타데이터 (title, description, canonical, Open Graph, 발행·수정일) */
export function pageMetadata({ title, description, path, noindex, type = "website", publishedTime, modifiedTime }: PageMetaInput): Metadata {
  const desc = description ?? siteConfig.description;
  const hideFromSearch = siteConfig.isPreview || noindex;
  return {
    title,
    description: desc,
    alternates: { canonical: path },
    openGraph: {
      type,
      title: title ? `${title} | ${siteConfig.name}` : siteConfig.name,
      description: desc,
      url: path,
      siteName: siteConfig.name,
      locale: siteConfig.locale,
      ...(type === "article" ? { publishedTime, modifiedTime } : {}),
    },
    robots: hideFromSearch ? { index: false, follow: false } : undefined,
  };
}

/** 기사 구조화 데이터 (JSON-LD). 원문 출처를 isBasedOn으로 밝힌다. */
export function storyJsonLd(s: Story) {
  return {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: s.title,
    description: s.summary,
    datePublished: s.publishedAt,
    dateModified: s.updatedAt,
    author: { "@type": "Organization", name: siteConfig.name },
    publisher: { "@type": "Organization", name: siteConfig.name },
    mainEntityOfPage: `${siteConfig.url}/stories/${s.slug}/`,
    isBasedOn: [s.sourceUrl, ...s.secondarySources.map((x) => x.sourceUrl)],
    about: s.topics,
  };
}
