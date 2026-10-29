/**
 * Gemini 무료 등급 안전장치 (Phase 7.3) — 무료 여부가 불확실하면 부르지 않는다
 *
 *   - 결제 등급: DAILY_GEMINI_BILLING_TIER=free 로 운영자가 직접 확인해 표시해야만 호출 (paid·빈 값·그 밖은 차단)
 *   - AI마중 자체 예산: 하루 최대 8회 · 요청 간격 20초 이상 · 동시에 1개. 실패한 요청도 1회로 센다 (호출 '전'에 기록)
 *   - 429 · RESOURCE_EXHAUSTED: 다시 시도하지 않고 그날(태평양 시간 기준) 남은 호출을 모두 멈춘다
 *   - 사용 기록은 처리 대기열 파일(pipeline-queue.json)의 gemini 칸에 남아 DAILY 실행끼리 같은 예산을 쓴다
 *     (workflow concurrency 'aimajung-daily'로 DAILY 실행은 한 번에 하나). 이 예산은 AI마중 자동화 몫일 뿐이고,
 *     같은 Google 프로젝트의 다른 사용량은 여기서 알 수 없다 — 프로젝트 전체 무료 잔여량을 보장하지 않는다.
 * 무료 한도는 Google AI Studio 기준 태평양 시간 자정에 초기화되므로 하루 구분도 태평양 시간으로 한다.
 */
export const GEMINI_SAFE = { maxPerDay: 8, minIntervalMs: 20_000 };

export const pacificDay = (ms) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));

/** 결제 등급 확인 — free가 아니면(유료·확인 불가) 차단 이유 */
export function geminiTierBlocker(env = process.env) {
  const tier = String(env.DAILY_GEMINI_BILLING_TIER ?? "").trim().toLowerCase();
  if (tier === "free") return null;
  if (!tier) return "DAILY_GEMINI_BILLING_TIER가 비어 있음 — AI Studio에서 결제 등급 '무료'를 확인한 뒤 free로 표시해야 함 (확인 불가 → 호출 안 함)";
  return `결제 등급 '${tier}' — 무료(free)가 아니면 Gemini 원고 생성을 하지 않음 (유료 전환·유료 호출 안 함)`;
}

/** 오늘 기록 (날짜가 바뀌면 새로 센다. 마지막 호출 시각은 간격 계산에 남긴다) */
function today(state, now) {
  const day = pacificDay(now);
  if (state.day !== day) Object.assign(state, { day, calls: 0, exhausted: false });
  return state;
}

/**
 * 호출 가능 여부. ok면 waitMs만큼 기다린 뒤 record()를 먼저 하고 요청한다.
 * @param {{day?:string,calls?:number,lastAt?:number,exhausted?:boolean,inFlight?:boolean}} state
 */
export function checkGeminiBudget(state, { now = Date.now(), maxPerDay = GEMINI_SAFE.maxPerDay, minIntervalMs = GEMINI_SAFE.minIntervalMs } = {}) {
  const s = today(state, now);
  if (s.inFlight) return { ok: false, reason: "다른 Gemini 요청이 진행 중 — 동시에 1개만 (다음 실행에서 작성)" };
  if (s.exhausted) return { ok: false, reason: "오늘 무료 등급 한도(429·RESOURCE_EXHAUSTED) 도달 — 내일(태평양 시간) 다시" };
  const cap = Math.min(maxPerDay, GEMINI_SAFE.maxPerDay);
  if ((s.calls ?? 0) >= cap) return { ok: false, reason: `AI마중 Gemini 하루 예산 ${cap}회 소진 — 다음 날 작성` };
  return { ok: true, remaining: cap - (s.calls ?? 0), waitMs: Math.max(0, (s.lastAt ?? 0) + minIntervalMs - now) };
}

/** 요청 직전에 기록 — 요청이 실패해도 1회로 센다 */
export function recordGeminiCall(state, now = Date.now()) {
  const s = today(state, now);
  s.calls = (s.calls ?? 0) + 1;
  s.lastAt = now;
  return s;
}

/** 한도 응답인지: 429 또는 본문의 RESOURCE_EXHAUSTED (상태 코드가 달라도) */
export const isQuotaError = (status, bodyText = "") => status === 429 || /RESOURCE_EXHAUSTED/.test(String(bodyText));
