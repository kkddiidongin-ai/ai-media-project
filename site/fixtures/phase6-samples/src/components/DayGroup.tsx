import { weekdayLabels } from "@/config/labels";
import type { DayGroup } from "@/lib/daily";
import { dateAnchor, weekdayIndex } from "@/lib/format";
import { toStory } from "@/lib/story";
import { StoryList } from "./Story";

/**
 * 하루치 묶음: 굵은 윗선 + 날짜 → 그날 올라온 글 목록.
 * 데스크톱은 왼쪽에 날짜 칸(스크롤 시 따라옴), 모바일은 날짜 줄 아래 세로 피드.
 */
export function DayGroupView({ day, skip = [] }: { day: DayGroup; skip?: string[] }) {
  const items = day.articles.filter((a) => !skip.includes(a.slug)).map(toStory);
  if (items.length === 0) return null;
  const [y, m, d] = day.date.split("-");
  const weekday = weekdayLabels[weekdayIndex(day.date)];
  const headingId = dateAnchor(day.date);

  return (
    <section id={headingId} aria-labelledby={`${headingId}-h`} className="scroll-mt-20 border-t-2 border-ink pt-4 md:grid md:grid-cols-[10rem_1fr] md:gap-8">
      <header className="mb-2 md:mb-0">
        <div className="md:sticky md:top-24">
          <h2 id={`${headingId}-h`} className="flex items-baseline gap-2 md:block">
            <span className="font-mono text-2xl font-bold tracking-tight text-ink md:block md:text-[2rem] md:leading-none">
              {m}.{d}
            </span>
            <span className="text-sm text-muted md:mt-2 md:block">
              {y} · {weekday}요일
            </span>
          </h2>
          <p className="hidden text-xs text-muted md:mt-1 md:block">{day.articles.length}편</p>
        </div>
      </header>
      <StoryList items={items} />
    </section>
  );
}
