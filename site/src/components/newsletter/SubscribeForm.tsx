"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { newsletterInterests, newsletterMessages, newsletterPrivacy, normalizeEmail, SUBSCRIBE_ENDPOINT } from "@/config/newsletter";

type Phase = "idle" | "sending" | "success" | "error";

/**
 * 서버 응답 code → 화면 문구. 모르는 code는 일반 오류 문구로.
 * 이중 확인: 신청이 받아지면 항상 '확인 메일을 보냈습니다' (이미 구독 중인 주소인지는 알려주지 않는다)
 */
function messageFor(code: unknown): { phase: Phase; text: string } {
  switch (code) {
    case "confirmation_sent":
      return { phase: "success", text: newsletterMessages.confirmationSent };
    case "invalid_email":
      return { phase: "error", text: newsletterMessages.invalidEmail };
    case "consent_required":
      return { phase: "error", text: newsletterMessages.consentRequired };
    case "rate_limited":
      return { phase: "error", text: newsletterMessages.rateLimited };
    default:
      return { phase: "error", text: newsletterMessages.error };
  }
}

/**
 * 뉴스레터 구독 폼: 이메일(필수) · 관심 분야(선택, 여러 개) · 개인정보 수집·이용 동의(필수).
 * 이름 등 다른 정보는 받지 않는다. 숨은 website 칸은 봇 걸러내기용(허니팟)이다.
 */
export function SubscribeForm() {
  const id = useId();
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState("");
  const [fieldError, setFieldError] = useState<"email" | "consent" | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const consentRef = useRef<HTMLInputElement>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (phase === "sending") return;
    const form = e.currentTarget;
    const data = new FormData(form);
    const email = normalizeEmail(data.get("email"));
    if (!email) {
      setFieldError("email");
      setPhase("error");
      setMessage(newsletterMessages.invalidEmail);
      emailRef.current?.focus();
      return;
    }
    if (data.get("consent") !== "yes") {
      setFieldError("consent");
      setPhase("error");
      setMessage(newsletterMessages.consentRequired);
      consentRef.current?.focus();
      return;
    }
    setFieldError(null);
    setPhase("sending");
    setMessage("");
    try {
      const res = await fetch(SUBSCRIBE_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          interests: data.getAll("interests"),
          consent: true,
          website: data.get("website") ?? "",
        }),
      });
      const json = (await res.json().catch(() => null)) as { code?: string } | null;
      const next = messageFor(json?.code);
      setPhase(next.phase);
      setMessage(next.text);
      if (next.phase === "success") form.reset();
    } catch {
      setPhase("error");
      setMessage(newsletterMessages.error);
    }
  }

  const sending = phase === "sending";
  const tone = phase === "success" ? "border-night-accent/50 bg-night-accent/10 text-night-text" : "border-[#c7745c]/60 bg-[#c7745c]/10 text-night-text";

  return (
    <form onSubmit={onSubmit} noValidate aria-describedby={`${id}-status`} className="space-y-6">
      <div>
        <label htmlFor={`${id}-email`} className="block text-[14px] font-bold text-night-text">
          이메일 <span className="text-night-accent">(필수)</span>
        </label>
        <input
          ref={emailRef}
          id={`${id}-email`}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          maxLength={254}
          placeholder="you@example.com"
          aria-invalid={fieldError === "email" || undefined}
          className="mt-2 h-12 w-full rounded-[8px] border border-night-line bg-night-deep px-4 text-[16px] text-night-text placeholder:text-night-muted/70 focus:border-night-accent"
        />
      </div>

      <fieldset>
          <legend className="text-[14px] font-bold text-night-text">
            관심 분야 <span className="font-normal text-night-muted">(선택 · 여러 개 고를 수 있어요)</span>
          </legend>
          <div className="mt-3 flex flex-wrap gap-2">
            {newsletterInterests.map((it) => (
              <label key={it.key} className="cursor-pointer">
                <input type="checkbox" name="interests" value={it.key} className="peer sr-only" />
                <span className="inline-flex h-9 items-center rounded-full border border-night-line px-3.5 text-[13.5px] text-night-muted peer-checked:border-night-accent peer-checked:bg-night-accent/15 peer-checked:font-semibold peer-checked:text-night-text peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-night-accent hover:text-night-text">
                  {it.label}
                </span>
              </label>
            ))}
          </div>
      </fieldset>

      {/* 허니팟: 사람에게는 보이지 않는다 */}
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor={`${id}-website`}>웹사이트</label>
        <input id={`${id}-website`} name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="rounded-[8px] border border-night-line bg-night-raise px-4 py-3.5">
        <label className="flex cursor-pointer items-start gap-3 text-[14px] leading-[1.6] text-night-text">
          <input
            ref={consentRef}
            type="checkbox"
            name="consent"
            value="yes"
            required
            aria-invalid={fieldError === "consent" || undefined}
            className="mt-[3px] h-[18px] w-[18px] shrink-0 accent-[#8cc4a8]"
          />
          <span>
            <strong className="font-bold">개인정보 수집·이용에 동의합니다.</strong> <span className="text-night-accent">(필수)</span>
          </span>
        </label>
        <details className="mt-2 pl-[30px] text-[13px] leading-[1.7] text-night-muted">
          <summary className="cursor-pointer font-semibold text-night-muted hover:text-night-text">자세히 보기</summary>
          <dl className="mt-2 space-y-1.5">
            <div>
              <dt className="inline font-semibold text-night-text">수집 항목 · </dt>
              <dd className="inline">{newsletterPrivacy.items}</dd>
            </div>
            <div>
              <dt className="inline font-semibold text-night-text">이용 목적 · </dt>
              <dd className="inline">{newsletterPrivacy.purpose}</dd>
            </div>
            <div>
              <dt className="inline font-semibold text-night-text">보관 기간 · </dt>
              <dd className="inline">{newsletterPrivacy.retention}</dd>
            </div>
            <div>
              <dt className="inline font-semibold text-night-text">구독 해지 · </dt>
              <dd className="inline">{newsletterPrivacy.withdraw}</dd>
            </div>
            <div>
              <dt className="inline font-semibold text-night-text">저장 위치 · </dt>
              <dd className="inline">{newsletterPrivacy.processor}</dd>
            </div>
          </dl>
          <p className="mt-2">동의하지 않을 수 있으며, 동의하지 않으면 뉴스레터를 받을 수 없습니다.</p>
        </details>
      </div>

      <button
        type="submit"
        disabled={sending}
        aria-busy={sending || undefined}
        className="flex h-12 w-full items-center justify-center rounded-[8px] bg-night-accent text-[15px] font-extrabold text-night-deep hover:bg-[#a3d3bb] disabled:cursor-wait disabled:opacity-70"
      >
        {sending ? "신청하는 중…" : "AI마중 구독하기"}
      </button>

      <div id={`${id}-status`} role="status" aria-live="polite" className="min-h-0">
        {message ? <p className={`rounded-[8px] border px-4 py-3 text-[14px] leading-[1.6] ${tone}`}>{message}</p> : null}
      </div>
    </form>
  );
}
