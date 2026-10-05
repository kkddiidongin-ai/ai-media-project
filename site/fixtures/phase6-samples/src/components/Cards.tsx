import { toStory } from "@/lib/story";
import type { ArticleMeta } from "@/lib/types";
import { StoryList } from "./Story";

/**
 * 글 목록 (과제·확인 기록 페이지 공용).
 * Phase 6의 둥근 카드 3종을 Phase 6.1에서 제목 중심 목록으로 바꿨다.
 * 진행 중 표시·결론은 StoryItem의 메타 줄에 작게 들어간다.
 */
export function CardGrid({ items, showDate = true }: { items: ArticleMeta[]; showDate?: boolean }) {
  return <StoryList items={items.map(toStory)} showDate={showDate} />;
}
