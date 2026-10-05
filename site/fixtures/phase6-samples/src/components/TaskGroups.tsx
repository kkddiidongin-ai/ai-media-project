import Link from "next/link";
import { taskGroupLabels } from "@/config/labels";
import { getArticlesByTask, getTasks } from "@/lib/content";
import { taskHref } from "@/lib/format";
import type { TaskGroup } from "@/lib/types";

/**
 * 과제 목록 — 카테고리(일 / 가게·1인 사업 / 생활 / AI 바로 알기)는 페이지가 아니라 묶음 제목으로만 쓴다 (site-ia.md §1).
 * 글 수는 실제 확인한 글만 센다. 예시 글만 있으면 "예시만 있음"으로 표시한다.
 * Phase 6.1: 상자 대신 굵은 윗선 + 얇은 구분선의 지면형 목록.
 */
export function TaskGroups() {
  const tasks = getTasks();
  const groups = (Object.keys(taskGroupLabels) as TaskGroup[])
    .map((g) => ({ group: g, tasks: tasks.filter((t) => t.group === g) }))
    .filter((g) => g.tasks.length > 0);

  return (
    <div className="grid gap-x-10 gap-y-10 md:grid-cols-2 lg:grid-cols-3">
      {groups.map(({ group, tasks }) => (
        <section key={group} aria-labelledby={`group-${group}`} className="border-t-2 border-ink pt-3">
          <h2 id={`group-${group}`} className="mb-1 text-sm font-bold text-muted">
            {taskGroupLabels[group]}
          </h2>
          <ul className="divide-y divide-line">
            {tasks.map((t) => {
              const articles = getArticlesByTask(t.slug);
              const real = articles.filter((a) => !a.sample).length;
              const samples = articles.length - real;
              return (
                <li key={t.slug}>
                  <Link href={taskHref(t.slug)} className="group block py-4">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="font-serif text-xl font-bold text-ink group-hover:underline group-hover:underline-offset-4">{t.name}</span>
                      <span className="shrink-0 font-mono text-xs text-muted">
                        {real > 0 ? `확인 ${real}건` : samples > 0 ? `예시 ${samples}편` : "준비 중"}
                      </span>
                    </span>
                    <span className="mt-1 block text-sm leading-relaxed text-ink-soft">{t.description}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
