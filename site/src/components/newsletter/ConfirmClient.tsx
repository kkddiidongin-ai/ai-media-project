"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CONFIRM_ENDPOINT, confirmMessages } from "@/config/newsletter";

type State = "checking" | "confirmed" | "alreadyConfirmed" | "expired" | "invalid" | "error" | "rateLimited";

const fromCode: Record<string, State> = {
  confirmed: "confirmed",
  already_confirmed: "alreadyConfirmed",
  expired: "expired",
  invalid: "invalid",
  bad_request: "invalid",
  rate_limited: "rateLimited",
};

/** 링크의 #token=… 만 읽는다 (query로 오는 토큰은 서버 로그에 남을 수 있어 받지 않는다) */
function readToken(): string | null {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return hash.get("token");
}

/**
 * 구독 확인: 페이지를 열면 토큰을 본문에 담아 확인 API로 한 번 보낸다.
 * 결과가 정해지면(성공·이미 확인·만료·잘못됨) 주소창에서 토큰을 지운다. 일시 오류면 새로고침으로 다시 시도할 수 있게 남겨 둔다.
 */
export function ConfirmClient() {
  const [state, setState] = useState<State>("checking");
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = readToken();
    const finish = (next: State) => {
      setState(next);
      if (next !== "error" && next !== "rateLimited") window.history.replaceState(null, "", window.location.pathname);
    };
    if (!token) {
      finish("invalid");
      return;
    }
    fetch(CONFIRM_ENDPOINT, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) })
      .then((res) => res.json().catch(() => null))
      .then((json: { code?: string } | null) => finish(fromCode[json?.code ?? ""] ?? "error"))
      .catch(() => finish("error"));
  }, []);

  const done = state === "confirmed" || state === "alreadyConfirmed";
  const tone =
    state === "checking"
      ? "border-night-line bg-night-raise"
      : done
        ? "border-night-accent/50 bg-night-accent/10"
        : "border-[#c7745c]/60 bg-[#c7745c]/10";

  return (
    <div>
      <div role="status" aria-live="polite" aria-busy={state === "checking" || undefined} className={`rounded-[10px] border px-5 py-6 text-[16px] leading-[1.7] text-night-text sm:px-7 ${tone}`}>
        <p className={done ? "font-bold" : undefined}>{confirmMessages[state]}</p>
      </div>
      <div className="mt-6 flex flex-wrap gap-2 text-[14px] font-semibold">
        {done ? (
          <Link href="/newsletters/" className="rounded-[8px] border border-night-line bg-night-raise px-4 py-2.5 text-night-text hover:border-night-muted">
            지난 뉴스레터 보기 →
          </Link>
        ) : state === "expired" || state === "invalid" ? (
          <Link href="/newsletter/subscribe/" className="rounded-[8px] border border-night-line bg-night-raise px-4 py-2.5 text-night-text hover:border-night-muted">
            구독 페이지로 가기 →
          </Link>
        ) : null}
        <Link href="/" className="rounded-[8px] border border-night-line px-4 py-2.5 text-night-muted hover:text-night-text">
          AI마중 홈
        </Link>
      </div>
    </div>
  );
}
