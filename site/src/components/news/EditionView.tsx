import Link from "next/link";
import type { ReactNode } from "react";
import { CategoryTag } from "@/components/news/Story";
import { SubscribeCta } from "@/components/newsletter/SubscribeCta";
import { PaperCard, Wrap } from "@/components/ui";
import { siteConfig } from "@/config/site";
import { getStory, type Edition, type Story } from "@/lib/news";
import { formatDate, storyHref } from "@/lib/format";

/**
 * 메일로 발행한 뉴스레터 호의 웹 버전.
 * 원고는 newsletter/editions/<id>.json (메일 렌더러와 같은 파일)이고, 순서도 메일과 같다:
 * 도입 → 오늘의 메인(본문·핵심 숫자·이 뉴스의 POINT·전체 기사) → 놓치면 아쉬운 변화 → (직접 확인) → 오늘의 흐름 → (더 읽어보기).
 * 화면 구성은 메일 HTML이 아니라 사이트의 종이 카드·타이포그래피를 쓴다.
 */

function SectionHead({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 id={id} className="mb-4 text-[18px] font-extrabold leading-snug text-ink">
      {children}
    </h2>
  );
}

function Section({ labelledBy, children }: { labelledBy: string; children: ReactNode }) {
  return (
    <section aria-labelledby={labelledBy} className="border-t-[6px] border-line px-6 py-8 sm:px-9">
      {children}
    </section>
  );
}

function PointBox({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-[8px] border-l-4 border-accent bg-accent-soft px-5 py-4">
      <p className="mb-2 text-[14.5px] font-extrabold text-accent">{title}</p>
      {children}
    </div>
  );
}

/** 기사 원 발표일 표시 (뉴스레터 발행일과 구분) */
function StoryMeta({ s }: { s: Story }) {
  return (
    <p className="mb-1.5 flex flex-wrap items-center gap-2 text-[12px] text-muted">
      <CategoryTag category={s.category} tone="paper" />
      <span className="font-mono">발표 {formatDate(s.eventDate)}</span>
    </p>
  );
}

export function EditionView({ edition }: { edition: Edition }) {
  const story = (slug: string) => getStory(slug)!;
  const main = story(edition.main.slug);

  return (
    <Wrap className="pt-8">
      <p className="mb-3 text-[13px]">
        <Link href="/newsletters/" className="text-night-muted hover:text-night-text">
          ← 뉴스레터 전체
        </Link>
      </p>

      <PaperCard>
        <header className="bg-ink px-6 py-7 text-paper sm:px-9">
          <p className="text-[12px] font-extrabold tracking-[0.12em] text-night-accent">AI마중 뉴스레터 {edition.number}호</p>
          <h1 className="mt-1 text-[26px] font-bold tracking-[-0.02em] text-white sm:text-[30px]">{siteConfig.shortName}</h1>
          <p className="mt-1 text-[14px] text-night-muted">{siteConfig.descriptor}</p>
          <p className="mt-4 font-mono text-[13px] font-semibold text-night-text">{edition.dateLine}</p>
        </header>

        {edition.intro.length ? (
          <div className="space-y-3 px-6 py-7 text-[16px] leading-[1.8] text-ink sm:px-9">
            {edition.intro.map((t) => (
              <p key={t}>{t}</p>
            ))}
          </div>
        ) : null}

        <Section labelledBy="ed-main">
          <SectionHead id="ed-main">🔥 오늘의 메인</SectionHead>
          <StoryMeta s={main} />
          <h3 className="mb-4 text-[22px] font-extrabold leading-[1.45] tracking-[-0.01em] text-ink sm:text-[24px]">
            <Link href={storyHref(main.slug)} className="hover:underline hover:underline-offset-4">
              {edition.main.title || main.title}
            </Link>
          </h3>
          <div className="space-y-4 text-[16px] leading-[1.8] text-ink-soft">
            {edition.main.body.map((t) => (
              <p key={t}>{t}</p>
            ))}
          </div>

          {edition.main.keyNumbers?.length ? (
            <div className="mt-6">
              <p className="mb-1 text-[13px] font-extrabold text-muted">핵심 숫자</p>
              <dl className="border-t-2 border-accent">
                {edition.main.keyNumbers.map((k) => (
                  <div key={k.value} className="border-b border-line py-3.5">
                    <dt className="text-[26px] font-extrabold leading-tight tracking-[-0.01em] text-accent sm:text-[28px]">{k.value}</dt>
                    <dd className="mt-1 text-[13.5px] leading-relaxed text-muted">{k.label}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}

          {edition.main.facts?.length ? (
            <div className="mt-6">
              <p className="mb-2 text-[13px] font-extrabold text-muted">핵심 사실</p>
              <ul className="list-disc space-y-2 pl-5 text-[15.5px] leading-relaxed text-ink">
                {edition.main.facts.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {edition.main.point ? (
            <div className="mt-6">
              <PointBox title="이 뉴스의 POINT">
                <p className="text-[15.5px] leading-[1.75] text-ink">{edition.main.point}</p>
              </PointBox>
            </div>
          ) : null}

          <Link
            href={storyHref(main.slug)}
            className="mt-6 inline-flex h-11 items-center rounded-[8px] bg-accent px-5 text-[14.5px] font-extrabold text-white hover:bg-accent-strong"
          >
            {edition.main.cta || "전체 내용 보기 →"}
          </Link>
        </Section>

        {edition.more.length ? (
          <Section labelledBy="ed-more">
            <SectionHead id="ed-more">⚡ 놓치면 아쉬운 변화</SectionHead>
            <div className="space-y-7">
              {edition.more.map((m) => {
                const s = story(m.slug);
                return (
                  <article key={m.slug}>
                    <StoryMeta s={s} />
                    <h3 className="mb-2 text-[17px] font-extrabold leading-snug text-ink">
                      <Link href={storyHref(s.slug)} className="hover:underline hover:underline-offset-4">
                        {m.title || s.title}
                      </Link>
                    </h3>
                    <p className="text-[15.5px] leading-[1.75] text-ink-soft">{m.change}</p>
                    {m.why ? (
                      <p className="mt-2 text-[15.5px] leading-[1.75] text-ink">
                        <strong className="mr-1.5 text-accent">왜 봐야 하나</strong>
                        {m.why}
                      </p>
                    ) : null}
                    <Link href={storyHref(s.slug)} className="mt-2 inline-block text-[14px] font-semibold text-accent underline underline-offset-4">
                      자세히 보기 →
                    </Link>
                  </article>
                );
              })}
            </div>
          </Section>
        ) : null}

        {edition.checked.length ? (
          <Section labelledBy="ed-checked">
            <SectionHead id="ed-checked">🧪 AI마중이 직접 확인했습니다</SectionHead>
            <div className="space-y-5">
              {edition.checked.map((c) => {
                const s = story(c.slug);
                return (
                  <article key={c.slug}>
                    <h3 className="mb-1.5 text-[17px] font-extrabold leading-snug text-ink">
                      <Link href={storyHref(s.slug)} className="hover:underline hover:underline-offset-4">
                        {s.title}
                      </Link>
                    </h3>
                    <p className="text-[15.5px] leading-[1.75] text-ink-soft">{c.summary}</p>
                  </article>
                );
              })}
            </div>
          </Section>
        ) : null}

        {edition.dayPoint ? (
          <Section labelledBy="ed-flow">
            <PointBox title="📌 오늘의 흐름">
              <h2 id="ed-flow" className="sr-only">
                오늘의 흐름
              </h2>
              <p className="text-[12.5px] font-extrabold text-muted">확인된 사실</p>
              <p className="mb-4 mt-1 text-[15.5px] leading-[1.75] text-ink">{edition.dayPoint.fact}</p>
              <p className="text-[12.5px] font-extrabold text-muted">AI마중의 해석</p>
              <p className="mt-1 text-[15.5px] leading-[1.75] text-ink">{edition.dayPoint.opinion}</p>
            </PointBox>
          </Section>
        ) : null}

        {edition.readMore.length ? (
          <Section labelledBy="ed-read">
            <SectionHead id="ed-read">📚 더 읽어보기</SectionHead>
            <ul className="space-y-2.5 text-[15px]">
              {edition.readMore.map((r) => {
                const s = story(r.slug);
                return (
                  <li key={r.slug}>
                    <Link href={storyHref(s.slug)} className="text-ink underline underline-offset-4">
                      {s.title}
                    </Link>{" "}
                    <span className="font-mono text-[12px] text-muted">{formatDate(s.eventDate)}</span>
                  </li>
                );
              })}
            </ul>
          </Section>
        ) : null}
      </PaperCard>

      <p className="mt-5 text-[13px] leading-relaxed text-night-muted">
        이 호는 {formatDate(edition.id)}에 메일로 발행했습니다. 각 기사의 날짜는 원문이 발표된 날입니다.
      </p>
      <SubscribeCta className="mt-8" />
    </Wrap>
  );
}
