import { getTask, isTracking } from "./content";
import { trackProgress } from "./format";
import type { ArticleMeta, Format, Verdict } from "./types";

/** 목록·검색에 필요한 만큼만 뽑은 글 정보 (본문 HTML 제외) */
export interface StoryData {
  slug: string;
  title: string;
  summary: string;
  format: Format;
  taskSlug: string;
  taskName: string | null;
  tools: string[];
  publishedAt: string | null;
  checkedAt: string | null;
  verdict: Verdict | null;
  /** 진행 중 표시 등 한 줄 부가 정보 */
  note: string | null;
  sample: boolean;
}

export function toStory(a: ArticleMeta): StoryData {
  let note: string | null = null;
  if (isTracking(a)) {
    const days = a.track?.days ?? 30;
    note = a.sample ? `진행 중 · ${days}일 예정 (시작 전)` : `진행 중 · ${trackProgress(a.track?.startedAt, days)}`;
  }
  return {
    slug: a.slug,
    title: a.title,
    summary: a.summary,
    format: a.format,
    taskSlug: a.task,
    taskName: getTask(a.task)?.name ?? null,
    tools: a.tools,
    publishedAt: a.publishedAt ?? null,
    checkedAt: a.checkedAt ?? null,
    verdict: a.sample ? null : (a.verdict ?? null),
    note,
    sample: a.sample,
  };
}
