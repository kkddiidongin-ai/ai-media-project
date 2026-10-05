import type { Metadata, Viewport } from "next";
import { Noto_Sans_KR } from "next/font/google";
import { Masthead } from "@/components/shell/Masthead";
import { PreviewBanner } from "@/components/shell/PreviewBanner";
import { SiteFooter } from "@/components/shell/SiteFooter";
import { tickerTopicSlugs } from "@/config/labels";
import { siteConfig } from "@/config/site";
import { topicCounts } from "@/lib/news";
import "./globals.css";

// 한글 글꼴은 용량이 커서 미리 불러오지 않고(preload: false) 필요한 글자 범위만 받는다.
const sans = Noto_Sans_KR({
  variable: "--font-noto-sans",
  weight: ["400", "500", "700", "800"],
  subsets: ["latin"],
  preload: false,
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: `${siteConfig.name} — ${siteConfig.tagline}`,
    template: `%s | ${siteConfig.name}`,
  },
  description: siteConfig.description,
  applicationName: siteConfig.name,
  openGraph: {
    type: "website",
    siteName: siteConfig.name,
    locale: siteConfig.locale,
    title: siteConfig.name,
    description: siteConfig.description,
  },
  robots: siteConfig.isPreview ? { index: false, follow: false } : undefined,
};

export const viewport: Viewport = {
  themeColor: "#0d0d0c",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const counts = topicCounts();
  const ticker = tickerTopicSlugs
    .map((slug) => counts.find((c) => c.topic.slug === slug))
    .filter((c) => c !== undefined && c.count > 0)
    .map((c) => ({ slug: c!.topic.slug, name: c!.topic.name, count: c!.count, latest: c!.latest }));

  return (
    <html lang="ko" className={sans.variable}>
      <body className="flex min-h-screen flex-col antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-sm focus:bg-white focus:px-4 focus:py-2 focus:text-ink"
        >
          본문으로 건너뛰기
        </a>
        <Masthead ticker={ticker} />
        <main id="main" className="flex-1">
          {children}
        </main>
        <SiteFooter />
        <PreviewBanner />
      </body>
    </html>
  );
}
