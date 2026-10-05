import {
  formatLabels,
  sampleLabel,
  verdictLabels,
  verificationLabels,
} from "@/config/labels";
import { formatDate } from "@/lib/format";
import type { Format, Verdict, VerificationMethod } from "@/lib/types";

export function SampleChip({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-[2px] bg-amber-soft px-1 font-mono text-[0.65rem] font-bold leading-[1.5] tracking-wider text-amber ${className}`}
      title="구조 확인용 예시 글입니다. 실제 실험 결과가 아닙니다."
    >
      {sampleLabel}
    </span>
  );
}

export function FormatLabel({ format }: { format: Format }) {
  return <span className="text-xs font-medium text-muted">{formatLabels[format]}</span>;
}

const verdictStyle: Record<Verdict, string> = {
  useful: "border-accent/40 bg-accent-soft text-accent-strong",
  conditional: "border-amber/40 bg-amber-soft text-amber",
  notRecommended: "border-stamp/40 bg-stamp-soft text-stamp",
  belowClaim: "border-stamp/40 bg-stamp-soft text-stamp",
};

export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  return (
    <span className={`inline-flex items-center rounded-sm border px-2 py-0.5 text-xs font-bold ${verdictStyle[verdict]}`}>
      결론 · {verdictLabels[verdict]}
    </span>
  );
}

/** 확인 방식: 도장처럼 테두리만 있는 표시 */
export function MethodBadge({ method }: { method: VerificationMethod }) {
  return (
    <span className="inline-flex items-center rounded-sm border border-ink/30 px-1.5 py-0.5 text-xs font-medium text-ink-soft">
      {verificationLabels[method]}
    </span>
  );
}

export function CheckedDate({ date, sample }: { date?: string | null; sample?: boolean }) {
  if (!date) {
    return <span className="font-mono text-xs text-muted">{sample ? "확인 전" : "확인일 없음"}</span>;
  }
  return (
    <span className="font-mono text-xs text-muted">
      <span className="sr-only">확인한 날 </span>
      {formatDate(date)}
    </span>
  );
}
