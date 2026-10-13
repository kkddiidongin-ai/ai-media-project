/**
 * 소스 상태 · 수집 창 따라잡기 (Phase 7.1.5)
 *
 * 소스 상태: HTTP 200이어도 글 주소를 하나도 못 찾으면 정상으로 보지 않는다.
 * 다만 발표가 없는 날도 있으므로 '기간 안 0건' 한 번은 정상이다 (NO_NEW).
 *   OK       요청·파싱 정상 (기간 안 글이 0건이어도 글 목록 자체는 읽힘)
 *   WARNING  리다이렉트 · 발행일 없는 글 · 일부 오류 · 기간 안 0건이 연속 WARN_STREAK회 이상 · 글 목록 0개 첫 발생
 *   DEGRADED 글 목록 0개가 2회 연속이거나 리다이렉트와 겹침(구조 변경) · 기간 안 0건이 연속 DEGRADED_STREAK회 이상
 *   FAILED   요청 실패·차단
 *   SKIPPED  비활성 소스
 * 기록(history)은 소스별 최근 정상 수집일 · 연속 0건 횟수를 날짜 단위로 남긴다 (같은 날 재실행은 한 번으로 센다).
 */
import fs from "node:fs";
import path from "node:path";

export const WARN_STREAK = 5;
export const DEGRADED_STREAK = 10;
export const MAX_CATCHUP_DAYS = 7;

const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);

export function loadHistory(file) {
  if (!file || !fs.existsSync(file)) return { sources: {}, lastRun: null };
  try {
    const h = JSON.parse(fs.readFileSync(file, "utf8"));
    return { sources: h.sources ?? {}, lastRun: h.lastRun ?? null };
  } catch {
    return { sources: {}, lastRun: null };
  }
}
export function saveHistory(file, h) {
  if (!file) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(h, null, 2) + "\n");
}

/**
 * 소스 하나의 상태 판정 + 기록 갱신 (history를 바꾸지 않고 새 항목을 돌려준다)
 * @param {object} s collectDaily의 소스 결과 (status · http · parsed · matched · inWindow · undated · errors)
 * @param {object|undefined} prev 이전 기록
 */
export function assessSource(s, prev, date) {
  if (s.status === "skipped") return { health: "SKIPPED", reasons: [s.reason ?? "비활성"], record: prev ?? null };
  const p = prev ?? {};
  const sameDay = p.lastRunDate === date; // 같은 날 재실행은 연속 횟수를 늘리지 않는다
  const base = sameDay ? { zeroStreak: p.zeroStreakBefore ?? 0, emptyStreak: p.emptyStreakBefore ?? 0 } : { zeroStreak: p.zeroStreak ?? 0, emptyStreak: p.emptyStreak ?? 0 };
  const requestOk = s.status === "success" || s.status === "partial";
  const listEmpty = requestOk && s.matched === 0;
  const zeroStreak = requestOk && !(s.inWindow > 0) ? base.zeroStreak + 1 : 0;
  const emptyStreak = listEmpty ? base.emptyStreak + 1 : 0;
  const record = {
    lastRunDate: date,
    zeroStreakBefore: base.zeroStreak,
    emptyStreakBefore: base.emptyStreak,
    zeroStreak,
    emptyStreak,
    lastOkDate: requestOk && s.matched > 0 ? date : (p.lastOkDate ?? null),
    lastItemDate: s.inWindow > 0 ? date : (p.lastItemDate ?? null),
    lastHttpStatus: s.http?.status ?? null,
  };
  const reasons = [];
  let health = "OK";
  const up = (h) => {
    const order = ["OK", "WARNING", "DEGRADED", "FAILED"];
    if (order.indexOf(h) > order.indexOf(health)) health = h;
  };
  if (!requestOk) {
    up("FAILED");
    reasons.push(`요청 실패 (${s.status}${s.http?.status ? `, HTTP ${s.http.status}` : ""})`);
  }
  if (s.http?.redirected) {
    up("WARNING");
    reasons.push(`리다이렉트 → ${s.http.finalUrl ?? "다른 주소"}`);
  }
  if (listEmpty) {
    const structural = emptyStreak >= 2 || s.http?.redirected;
    up(structural ? "DEGRADED" : "WARNING");
    reasons.push(`HTTP ${s.http?.status ?? "?"}인데 글 주소 0개 (전체 ${s.parsed ?? 0}개 중 형식 일치 0${emptyStreak >= 2 ? ` · ${emptyStreak}회 연속` : ""}) — 구조 변경 의심`);
  }
  if (s.status === "partial") {
    up("WARNING");
    reasons.push("일부 요청 실패");
  }
  if (s.undated > 0) {
    up("WARNING");
    reasons.push(`발행일을 확인하지 못한 글 ${s.undated}건 (후보에서 제외)`);
  }
  if (!listEmpty && requestOk && zeroStreak >= DEGRADED_STREAK) {
    up("DEGRADED");
    reasons.push(`기간 안 새 글 0건 ${zeroStreak}회 연속 (마지막 수집 ${record.lastItemDate ?? "기록 없음"})`);
  } else if (!listEmpty && requestOk && zeroStreak >= WARN_STREAK) {
    up("WARNING");
    reasons.push(`기간 안 새 글 0건 ${zeroStreak}회 연속 (마지막 수집 ${record.lastItemDate ?? "기록 없음"})`);
  }
  const note = health === "OK" && requestOk && !(s.inWindow > 0) ? "NO_NEW" : null; // 정상적인 0건
  return { health, reasons, note, record };
}

/** 전체 소스 판정. history.sources를 갱신한 새 history를 돌려준다 */
export function assessSources(sources, history, date) {
  const next = { ...history, sources: { ...history.sources } };
  const out = sources.map((s) => {
    const a = assessSource(s, history.sources[s.id], date);
    if (a.record) next.sources[s.id] = a.record;
    return { ...s, health: a.health, healthReasons: a.reasons, ...(a.note ? { healthNote: a.note } : {}), lastOkDate: a.record?.lastOkDate ?? null, lastItemDate: a.record?.lastItemDate ?? null, zeroStreak: a.record?.zeroStreak ?? null };
  });
  return { sources: out, history: next };
}

/**
 * 예약 실행이 빠지거나 늦어도 놓치지 않도록 수집 시작일을 정한다.
 * 기본 창(date-windowDays)과 마지막 실행일 중 이른 날부터, 단 최대 MAX_CATCHUP_DAYS일 전까지만.
 * 마지막 실행일을 모르면 기본 창.
 */
export function catchUpSince({ date, windowDays, lastRunDates = [], maxDays = MAX_CATCHUP_DAYS }) {
  const base = addDays(date, -windowDays);
  const floor = addDays(date, -maxDays);
  const last = lastRunDates.filter((d) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) && d < date).sort().at(-1);
  if (!last) return { since: base, reason: "기본 창" };
  if (last >= base) return { since: base, reason: `기본 창 (마지막 실행 ${last})` };
  if (last < floor) return { since: floor, reason: `따라잡기 최대 ${maxDays}일 (마지막 실행 ${last} — 그 이전은 --from/--to 백필로)`, gapFrom: last };
  return { since: last, reason: `따라잡기 (마지막 실행 ${last})` };
}
