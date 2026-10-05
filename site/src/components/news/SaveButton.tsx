"use client";

import { useSyncExternalStore } from "react";

/**
 * 내가 모은 글 (Reference의 '이 브라우저에만 저장됨'과 같은 역할).
 * 로그인이 없으므로 localStorage에만 저장한다. 서버로 보내지 않는다.
 */
export const SAVED_KEY = "aimedia:saved:v1";
const EVENT = "aimedia:saved";

export interface SavedEntry {
  slug: string;
  savedAt: string;
}

function rawSaved(): string {
  try {
    return window.localStorage.getItem(SAVED_KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

export function parseSaved(raw: string | null): SavedEntry[] {
  try {
    const v = JSON.parse(raw ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x?.slug === "string") : [];
  } catch {
    return [];
  }
}

export function writeSaved(list: SavedEntry[]) {
  try {
    window.localStorage.setItem(SAVED_KEY, JSON.stringify(list));
  } catch {
    /* 저장 불가 환경(시크릿 모드 등)에서는 조용히 무시 */
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

/** 저장 목록을 구독한다. 서버 렌더링 중에는 null (아직 모름). */
export function useSavedRaw(): string | null {
  return useSyncExternalStore(subscribe, rawSaved, () => null);
}

export function SaveButton({ slug, tone = "paper" }: { slug: string; tone?: "paper" | "dark" }) {
  const raw = useSavedRaw();
  const list = parseSaved(raw);
  const saved = list.some((s) => s.slug === slug);

  const toggle = () => {
    const current = parseSaved(rawSaved());
    writeSaved(current.some((s) => s.slug === slug) ? current.filter((s) => s.slug !== slug) : [{ slug, savedAt: new Date().toISOString() }, ...current]);
  };

  const base =
    tone === "dark"
      ? saved
        ? "border-night-accent bg-night-accent/15 text-night-accent"
        : "border-night-line text-night-muted hover:text-night-text"
      : saved
        ? "border-accent bg-accent-soft text-accent-strong"
        : "border-line-strong text-ink-soft hover:border-ink";

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={raw === null}
      aria-pressed={saved}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-[12.5px] font-bold transition-colors disabled:opacity-50 ${base}`}
      title="이 브라우저에만 저장됩니다"
    >
      <svg aria-hidden width="12" height="12" viewBox="0 0 12 12">
        <path d="M2.5 1.5h7v9L6 8.2 2.5 10.5z" fill={saved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      </svg>
      {saved ? "저장됨" : "저장"}
    </button>
  );
}
