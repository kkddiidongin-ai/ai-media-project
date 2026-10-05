"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { StoryIndexItem } from "@/lib/indexTypes";

/**
 * 가벼운 클라이언트 검색. 빌드 때 만든 /search-index.json을 한 번 받아 브라우저 안에서 거른다.
 * 대상: 제목·요약·주제(이름·별칭)·회사·제품·분류·출처. 띄어쓰기 차이는 무시하고, 여러 단어는 모두 포함해야 한다.
 * 한글·영문 별칭(OpenAI/오픈AI, Claude/클로드, Gemini/제미나이 …)은 topics.json의 aliases로 서로 찾아진다.
 */

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");

export interface TopicAliasGroup {
  slug: string;
  /** 주제 이름 + 별칭 */
  names: string[];
}

export function SearchClient({
  quickTopics,
  aliasGroups,
  categoryKo,
}: {
  quickTopics: { slug: string; name: string }[];
  aliasGroups: TopicAliasGroup[];
  /** 분류 영문 → 한글 (예: SECURITY → 보안) */
  categoryKo: Record<string, string>;
}) {
  const [index, setIndex] = useState<StoryIndexItem[] | null>(null);
  const [error, setError] = useState(false);
  const [q, setQ] = useState("");
  const [topic, setTopic] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  // 주소의 ?q= / ?topic= 을 처음 한 번 읽고, 색인을 받는다
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    /* eslint-disable react-hooks/set-state-in-effect -- 주소창 값은 브라우저에서만 읽을 수 있다 */
    setQ(p.get("q") ?? "");
    setTopic(p.get("topic"));
    /* eslint-enable react-hooks/set-state-in-effect */
    inputRef.current?.focus();
    fetch("/search-index.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: StoryIndexItem[]) => setIndex(data))
      .catch(() => setError(true));
  }, []);

  useEffect(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    if (topic) p.set("topic", topic);
    const qs = p.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [q, topic]);

  // 주제 slug → 이름·별칭(정규화), 별칭 → 같은 묶음의 모든 표기
  const { topicNames, synonyms } = useMemo(() => {
    const topicNames = new Map<string, string>();
    const synonyms = new Map<string, string[]>();
    for (const g of aliasGroups) {
      const ns = [...new Set(g.names.map(norm))];
      topicNames.set(g.slug, ns.join(" "));
      for (const n of ns) synonyms.set(n, [...new Set([...(synonyms.get(n) ?? []), ...ns])]);
    }
    return { topicNames, synonyms };
  }, [aliasGroups]);
  const prepared = useMemo(
    () =>
      index?.map((s) => ({
        s,
        h: norm(
          [s.title, s.summary, s.topics.map((t) => topicNames.get(t) ?? t).join(" "), s.companies.join(" "), s.products.join(" "), s.categoryEn, categoryKo[s.categoryEn] ?? "", s.sourceName].join(" "),
        ),
      })) ?? [],
    [index, topicNames, categoryKo],
  );
  const terms = q.trim().split(/\s+/).map(norm).filter(Boolean);
  const active = terms.length > 0 || topic !== null;
  // 검색어가 별칭이면 같은 묶음의 다른 표기로도 찾는다 (예: '오픈ai' → 'openai')
  const alts = terms.map((t) => synonyms.get(t) ?? [t]);
  const results = active ? prepared.filter(({ s, h }) => (!topic || s.topics.includes(topic)) && alts.every((a) => a.some((t) => h.includes(t)))).map(({ s }) => s) : [];

  return (
    <div>
      <form role="search" onSubmit={(e) => e.preventDefault()}>
        <label htmlFor={inputId} className="sr-only">
          검색어
        </label>
        <input
          ref={inputRef}
          id={inputId}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="회사·제품·주제·키워드 (예: Claude, 가격, 에이전트, 보안)"
          autoComplete="off"
          className="w-full rounded-[10px] border border-night-accent/60 bg-night-raise px-4 py-3 text-[16px] text-night-text placeholder:text-night-muted focus-visible:border-night-accent focus-visible:outline-none"
        />
      </form>
      <p className="mt-2 text-[12.5px] text-night-muted">{index ? `기사 ${index.length}건을 제목·요약·주제·회사·제품으로 검색합니다.` : " "}</p>

      <div className="mt-3 flex flex-wrap gap-2">
        {quickTopics.map((t) => (
          <button
            key={t.slug}
            type="button"
            aria-pressed={topic === t.slug}
            onClick={() => setTopic(topic === t.slug ? null : t.slug)}
            className={`rounded-full border px-3 py-1 text-[13px] font-semibold ${
              topic === t.slug ? "border-night-accent bg-night-accent text-night-deep" : "border-night-line text-night-muted hover:text-night-text"
            }`}
          >
            {t.name}
          </button>
        ))}
      </div>

      <div className="mt-8" aria-live="polite">
        {error ? (
          <p className="text-[14px] text-night-muted">검색 색인을 불러오지 못했습니다.</p>
        ) : !active ? null : index === null ? (
          <p className="text-[14px] text-night-muted">불러오는 중…</p>
        ) : results.length === 0 ? (
          <p className="text-[14px] text-night-muted">찾는 기사가 없습니다. 다른 말로 찾아보세요.</p>
        ) : (
          <>
            <p className="mb-3 text-[13px] font-bold text-night-text">
              {results.length}건{results.length > 100 ? <span className="font-normal text-night-muted"> · 최근 100건만 보여줍니다. 검색어를 더 넣어 좁혀 보세요.</span> : null}
            </p>
            <ul className="divide-y divide-night-line rounded-[10px] border border-night-line bg-night-raise px-5">
              {results.slice(0, 100).map((s) => (
                <li key={s.slug} className="py-3.5">
                  <p className="text-[11px] font-extrabold tracking-[0.08em] text-night-accent">{s.categoryEn}</p>
                  <Link href={`/stories/${s.slug}/`} className="mt-0.5 block text-[15px] font-bold leading-snug text-night-text hover:underline hover:underline-offset-4">
                    {s.title}
                  </Link>
                  <p className="mt-1 text-[12.5px] text-night-muted">
                    <span className="font-mono">{s.eventDate.replace(/-/g, ".")}</span> · {s.sourceName}
                  </p>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
