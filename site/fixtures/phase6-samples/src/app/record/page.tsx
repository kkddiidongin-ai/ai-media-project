import Link from "next/link";
import { SampleChip } from "@/components/Badges";
import { CardGrid } from "@/components/Cards";
import { Container, EmptyState, PageIntro, SectionHeading } from "@/components/ui";
import { versionTypeLabels } from "@/config/labels";
import { getArticle, getArticles, getCorrections, isTracking } from "@/lib/content";
import { articleHref, formatDate } from "@/lib/format";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "확인 기록",
  description: "진행 중인 실험, 최근 확인한 것, 기대에 못 미친 것, 업데이트와 정정 기록을 모았습니다.",
  path: "/record/",
});

/**
 * 확인 기록 — 실제 기록만 보여준다. 예시(SAMPLE) 글은 집계에 넣지 않고 맨 아래에 따로 분리한다.
 * 초기에는 총계 숫자를 크게 보여주지 않는다 (site-ia.md §10).
 */
export default function RecordPage() {
  const real = getArticles().filter((a) => !a.sample);
  const samples = getArticles().filter((a) => a.sample);
  const tracking = real.filter(isTracking);
  const recent = real.filter((a) => !isTracking(a) && a.checkedAt).slice(0, 12);
  const shortfalls = real.filter(
    (a) => a.verdict === "notRecommended" || a.verdict === "belowClaim" || a.versions.some((v) => v.type === "archive"),
  );
  const updates = real
    .flatMap((a) => a.versions.filter((v) => v.type === "update" || v.type === "retest").map((v) => ({ ...v, a })))
    .sort((x, y) => Date.parse(y.date) - Date.parse(x.date));
  const corrections = getCorrections().sort((x, y) => Date.parse(y.date) - Date.parse(x.date));

  return (
    <Container>
      <PageIntro title="확인 기록">
        지금 무엇을 확인하고 있는지, 최근에 무엇을 확인했는지, 어디서 기대에 못 미쳤는지, 무엇을 고쳤는지 한곳에서 볼 수 있습니다.
      </PageIntro>

      <nav aria-label="이 페이지의 섹션" className="sticky top-14 z-10 -mx-4 overflow-x-auto border-b border-line bg-paper/95 px-4 py-2 sm:top-16 sm:mx-0 sm:px-0">
        <ul className="flex gap-4 whitespace-nowrap text-sm">
          <li><a href="#tracking" className="text-ink-soft hover:text-ink">진행 중</a></li>
          <li><a href="#recent" className="text-ink-soft hover:text-ink">최근 확인</a></li>
          <li><a href="#shortfalls" className="text-ink-soft hover:text-ink">기대 미달·중단</a></li>
          <li><a href="#updates" className="text-ink-soft hover:text-ink">업데이트</a></li>
          <li><a href="#corrections" className="text-ink-soft hover:text-ink">정정</a></li>
        </ul>
      </nav>

      <div className="space-y-14 py-10">
        <section aria-labelledby="tracking">
          <SectionHeading id="tracking" description="끝나지 않은 오래 써보기입니다.">진행 중</SectionHeading>
          {tracking.length ? <CardGrid items={tracking} /> : <EmptyState title="진행 중인 실험이 없습니다" />}
        </section>

        <section aria-labelledby="recent">
          <SectionHeading id="recent" description="확인한 날짜 순입니다.">최근 확인</SectionHeading>
          {recent.length ? <CardGrid items={recent} /> : <EmptyState title="아직 확인을 마친 글이 없습니다">첫 확인 결과가 나오면 이곳에 올라옵니다.</EmptyState>}
        </section>

        <section aria-labelledby="shortfalls">
          <SectionHeading id="shortfalls" description="기대만큼 되지 않았거나, 중단한 실험도 숨기지 않습니다.">기대 미달·중단</SectionHeading>
          {shortfalls.length ? <CardGrid items={shortfalls} /> : <EmptyState title="아직 기록이 없습니다" />}
        </section>

        <section aria-labelledby="updates">
          <SectionHeading id="updates" description="도구나 요금이 바뀌어 다시 확인한 기록입니다.">업데이트</SectionHeading>
          {updates.length ? (
            <ul className="divide-y divide-line border-y border-line">
              {updates.map((u) => (
                <li key={`${u.a.slug}-${u.date}`} className="py-3 text-sm">
                  <span className="font-mono text-xs text-muted">{formatDate(u.date)}</span>{" "}
                  <span className="font-bold">{versionTypeLabels[u.type]}</span>{" "}
                  <Link href={articleHref(u.a.slug)} className="text-accent hover:underline">{u.a.title}</Link>
                  <p className="text-ink-soft">{u.note}</p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="아직 업데이트 기록이 없습니다" />
          )}
        </section>

        <section aria-labelledby="corrections">
          <SectionHeading id="corrections" description="틀린 내용을 발견하면 조용히 고치지 않고 여기에 남깁니다.">정정</SectionHeading>
          {corrections.length ? (
            <ul className="divide-y divide-line border-y border-line">
              {corrections.map((c) => {
                const a = getArticle(c.slug);
                return (
                  <li key={`${c.slug}-${c.date}`} className="py-3 text-sm">
                    <span className="font-mono text-xs text-muted">{formatDate(c.date)}</span>{" "}
                    {a ? <Link href={articleHref(a.slug)} className="text-accent hover:underline">{a.title}</Link> : c.slug}
                    <p className="text-ink-soft">틀린 것: {c.what}</p>
                    <p className="text-ink-soft">고친 것: {c.fix}</p>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState title="아직 정정 기록이 없습니다">오류를 발견하셨다면 <Link href="/about/#contact" className="underline">알려주세요</Link>.</EmptyState>
          )}
        </section>

        {samples.length > 0 ? (
          <details className="border-y border-dashed border-line-strong">
            <summary className="flex flex-wrap items-center gap-2 py-3 text-sm font-medium">
              <span aria-hidden className="chev text-muted">›</span>
              구조 확인용 예시 글 {samples.length}편 <SampleChip />
              <span className="w-full text-xs font-normal text-muted sm:ml-auto sm:w-auto">위 기록에는 포함하지 않습니다</span>
            </summary>
            <div className="border-t border-line py-6">
              <CardGrid items={samples} />
            </div>
          </details>
        ) : null}
      </div>
    </Container>
  );
}
