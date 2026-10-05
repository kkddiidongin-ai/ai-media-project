"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { formatLabels } from "@/config/labels";
import type { StoryData } from "@/lib/story";
import type { Format } from "@/lib/types";
import { StoryItem, StoryList } from "./Story";

/**
 * 가벼운 클라이언트 검색 (Phase 6.1).
 * 빌드 때 만든 /search-index.json을 한 번 받아 브라우저 안에서 거른다. 서버·외부 서비스 없음.
 * 검색어는 띄어쓰기로 나눠 모두 포함하는 글만 남긴다 (띄어쓰기 차이는 무시).
 */

const FORMATS = Object.keys(formatLabels) as Format[];

function norm(s: string) {
  return s.toLowerCase().replace(/\s+/g, "");
}

function haystack(s: StoryData) {
  return norm([s.title, s.summary, s.taskName ?? "", s.tools.join(" "), formatLabels[s.format]].join(" "));
}

function readParams() {
  const p = new URLSearchParams(window.location.search);
  const f = p.get("format");
  return {
    q: p.get("q") ?? "",
    format: f && (FORMATS as string[]).includes(f) ? (f as Format) : null,
    task: p.get("task"),
  };
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`border px-2.5 py-1 text-sm transition-colors ${
        active ? "border-ink bg-ink text-paper" : "border-line-strong text-ink-soft hover:border-ink hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

export function SearchClient({ tasks, startHere }: { tasks: { slug: string; name: string }[]; startHere: StoryData[] }) {
  const [index, setIndex] = useState<StoryData[] | null>(null);
  const [error, setError] = useState(false);
  const [q, setQ] = useState("");
  const [format, setFormat] = useState<Format | null>(null);
  const [task, setTask] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  // 주소의 ?q= / ?format= / ?task= 를 처음 한 번 읽는다 (다른 페이지에서 링크로 들어올 때)
  useEffect(() => {
    const p = readParams();
    /* eslint-disable react-hooks/set-state-in-effect -- 주소창 값은 브라우저에서만 읽을 수 있다 */
    setQ(p.q);
    setFormat(p.format);
    setTask(p.task);
    /* eslint-enable react-hooks/set-state-in-effect */
    inputRef.current?.focus();
    fetch("/search-index.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: StoryData[]) => setIndex(data))
      .catch(() => setError(true));
  }, []);

  // 검색 조건을 주소에 반영 (뒤로 가기·링크 공유용)
  useEffect(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    if (format) p.set("format", format);
    if (task) p.set("task", task);
    const qs = p.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [q, format, task]);

  const prepared = useMemo(() => index?.map((s) => ({ s, h: haystack(s) })) ?? [], [index]);
  const terms = q.trim().split(/\s+/).map(norm).filter(Boolean);
  const active = terms.length > 0 || format !== null || task !== null;
  const results = active
    ? prepared
        .filter(({ s, h }) => (!format || s.format === format) && (!task || s.taskSlug === task) && terms.every((t) => h.includes(t)))
        .map(({ s }) => s)
    : [];

  return (
    <div className="py-8">
      <form role="search" onSubmit={(e) => e.preventDefault()} className="max-w-3xl">
        <label htmlFor={inputId} className="sr-only">
          검색어
        </label>
        <div className="flex items-center border-b-2 border-ink focus-within:border-accent">
          <input
            ref={inputRef}
            id={inputId}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="예: 회의록, 이메일, 리뷰 답글, ChatGPT"
            autoComplete="off"
            className="w-full bg-transparent py-3 text-lg text-ink placeholder:text-muted focus-visible:outline-none sm:text-xl"
          />
        </div>
      </form>

      <div className="mt-5 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-16 shrink-0 text-xs font-bold text-muted">글 종류</span>
          {FORMATS.map((f) => (
            <Chip key={f} active={format === f} onClick={() => setFormat(format === f ? null : f)}>
              {formatLabels[f]}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-16 shrink-0 text-xs font-bold text-muted">하는 일</span>
          {tasks.map((t) => (
            <Chip key={t.slug} active={task === t.slug} onClick={() => setTask(task === t.slug ? null : t.slug)}>
              {t.name}
            </Chip>
          ))}
        </div>
      </div>

      <div className="mt-10" aria-live="polite">
        {error ? (
          <p className="text-sm text-stamp">검색 색인을 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.</p>
        ) : !active ? (
          startHere.length > 0 ? (
            <section aria-labelledby="start-here" className="border-t-2 border-ink pt-3">
              <h2 id="start-here" className="mb-4 text-sm font-bold text-muted">처음이라면</h2>
              <ul className="grid gap-x-10 md:grid-cols-2">
                {startHere.map((s) => (
                  <li key={s.slug} className="border-t border-line py-4 first:border-t-0 first:pt-1 md:[&:nth-child(2)]:border-t-0 md:[&:nth-child(2)]:pt-1">
                    <StoryItem s={s} variant="compact" />
                  </li>
                ))}
              </ul>
            </section>
          ) : null
        ) : index === null ? (
          <p className="text-sm text-muted">불러오는 중…</p>
        ) : (
          <section aria-labelledby="results" className="border-t-2 border-ink pt-3">
            <h2 id="results" className="mb-4 text-sm font-bold text-ink">
              {results.length > 0 ? `${results.length}건` : "찾는 글이 없습니다"}
              {results.length === 0 ? (
                <span className="mt-1 block font-normal text-muted">다른 말로 찾거나, 글 종류·하는 일 선택을 풀어 보세요.</span>
              ) : null}
            </h2>
            {results.length > 0 ? <StoryList items={results} columns={1} showDate /> : null}
          </section>
        )}
      </div>
    </div>
  );
}
