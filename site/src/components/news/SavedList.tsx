"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useState } from "react";
import type { StoryIndexItem } from "@/lib/indexTypes";
import { parseSaved, SaveButton, useSavedRaw, writeSaved } from "./SaveButton";

/** /saved/ 본문: 이 브라우저(localStorage)에 저장한 기사 목록 */
export function SavedList({ nextActions }: { nextActions?: ReactNode }) {
  const raw = useSavedRaw();
  const saved = parseSaved(raw);
  const [index, setIndex] = useState<Map<string, StoryIndexItem> | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/search-index.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: StoryIndexItem[]) => setIndex(new Map(data.map((d) => [d.slug, d]))))
      .catch(() => setError(true));
  }, []);

  if (raw === null || (!index && !error)) return <p className="text-[14px] text-night-muted">불러오는 중…</p>;
  if (error) return <p className="text-[14px] text-night-muted">기사 목록을 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.</p>;

  const rows = saved.map((s) => ({ s, item: index!.get(s.slug) }));

  if (rows.length === 0) {
    return (
      <div>
        <div className="rounded-[10px] border border-dashed border-night-line px-6 py-8 text-center">
          <p className="font-bold text-night-text">아직 모은 글이 없어요</p>
          <p className="mt-2 text-[14px] leading-relaxed text-night-muted">
            기사나 뉴스레터에서 <span className="font-semibold text-night-text">저장</span> 버튼을 누르면 여기에 쌓입니다. 목록은{" "}
            <strong className="text-night-text">이 브라우저에 저장됩니다.</strong>
          </p>
        </div>
        {nextActions}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between text-[13px] text-night-muted">
        <span>{rows.length}건</span>
        <button
          type="button"
          onClick={() => {
            if (window.confirm("모은 글을 모두 지울까요? 이 브라우저에서만 지워집니다.")) writeSaved([]);
          }}
          className="underline underline-offset-4 hover:text-night-text"
        >
          모두 지우기
        </button>
      </div>
      <ul className="divide-y divide-night-line rounded-[10px] border border-night-line bg-night-raise">
        {rows.map(({ s, item }) => (
          <li key={s.slug} className="flex items-start gap-3 px-5 py-4">
            <div className="min-w-0 flex-1">
              {item ? (
                <>
                  <p className="text-[11px] font-extrabold tracking-[0.08em] text-night-accent">{item.categoryEn}</p>
                  <Link href={`/stories/${item.slug}/`} className="mt-0.5 block text-[15px] font-bold leading-snug text-night-text hover:underline hover:underline-offset-4">
                    {item.title}
                  </Link>
                  <p className="mt-1 font-mono text-[12px] text-night-muted">
                    {item.eventDate.replace(/-/g, ".")} · 저장 {s.savedAt.slice(0, 10).replace(/-/g, ".")}
                  </p>
                </>
              ) : (
                <p className="text-[14px] text-night-muted">더 이상 찾을 수 없는 기사입니다 ({s.slug})</p>
              )}
            </div>
            <SaveButton slug={s.slug} tone="dark" />
          </li>
        ))}
      </ul>
    </div>
  );
}
