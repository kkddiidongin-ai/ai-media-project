import Link from "next/link";
import { TaskGroups } from "@/components/TaskGroups";
import { Container, PageIntro, SectionHeading } from "@/components/ui";
import { formatLabels } from "@/config/labels";
import { getArticles } from "@/lib/content";
import { pageMetadata } from "@/lib/seo";
import type { Format } from "@/lib/types";

export const metadata = pageMetadata({
  title: "하는 일로 찾기",
  description: "회의 정리, 업무 글쓰기, 가게 응대처럼 지금 하려는 일로 지난 콘텐츠를 찾아보세요.",
  path: "/tasks/",
});

/** 홈은 최신 콘텐츠 발견, 이 페이지는 지난 콘텐츠 탐색 (Phase 6.1) */
export default function TasksPage() {
  const articles = getArticles();
  const formats = (Object.keys(formatLabels) as Format[]).map((f) => ({ f, n: articles.filter((a) => a.format === f).length }));

  return (
    <Container>
      <PageIntro eyebrow="지난 콘텐츠 탐색" title="하는 일로 찾기">
        AI 도구 이름이 아니라, 지금 하려는 일로 골라보세요. 과제마다 지금까지 올라온 글과 아직 해보지 않은 것을 모아 두었습니다.
      </PageIntro>
      <div className="space-y-14 py-10">
        <TaskGroups />

        <section aria-labelledby="by-format">
          <SectionHeading id="by-format" description="같은 방식으로 확인한 글끼리 모아 봅니다.">
            글 종류로 보기
          </SectionHeading>
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            {formats.map(({ f, n }) => (
              <li key={f}>
                <Link href={`/search/?format=${f}`} className="group inline-flex items-baseline gap-1.5">
                  <span className="font-bold text-ink group-hover:underline group-hover:underline-offset-4">{formatLabels[f]}</span>
                  <span className="font-mono text-xs text-muted">{n}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Container>
  );
}
