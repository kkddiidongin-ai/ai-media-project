/**
 * 처리 대기열 · 체크포인트 (Phase 7.2)
 *
 * '무제한'은 기사 건수에 인위적인 상한이 없다는 뜻이다. 네트워크 요청·실행 시간에는 배치 크기를 두고,
 * 배치를 넘는 항목은 버리지 않고 이 대기열에 남겨 다음 실행이 먼저 처리한다.
 *
 *   items[id] = { stage: "evidence" | "draft", item, addedAt, since, attempts, reason }
 *     evidence: 근거 확인 대기 (배치·시간 예산 초과)
 *     draft:    발행 추천은 났지만 원고를 아직 못 만듦 (생성 수단 없음·배치 초과·실패) — 근거는 후보 파일에 보존
 *   meta[sourceId] = [{ loc, lastmod, since }]   소스별로 아직 열지 못한 글 주소 (페이지네이션 이월)
 *   retry[sourceId] = { since, failedAt, attempts, lastError }   요청이 실패한 소스 — 다음 실행이 그 시작일부터 다시 본다
 *
 * 파일은 처리할 때마다(배치 중간에도) 저장한다 — 실행이 중간에 끊겨도 다음 실행이 이어서 한다.
 */
import fs from "node:fs";
import path from "node:path";
import { PROCESSED_FILE } from "./lib.mjs";

export const QUEUE_FILE = process.env.DAILY_QUEUE_FILE || path.join(path.dirname(PROCESSED_FILE), "pipeline-queue.json");
const EMPTY = () => ({ version: 1, items: {}, meta: {}, retry: {}, updatedAt: null });

export function loadQueue(file) {
  if (!file || !fs.existsSync(file)) return EMPTY();
  try {
    const q = JSON.parse(fs.readFileSync(file, "utf8"));
    return { ...EMPTY(), ...q, items: q.items ?? {}, meta: q.meta ?? {}, retry: q.retry ?? {} };
  } catch {
    return EMPTY();
  }
}

export function saveQueue(file, q) {
  if (!file) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ ...q, updatedAt: new Date().toISOString() }, null, 2) + "\n");
  fs.renameSync(tmp, file); // 쓰는 도중에 끊겨도 반쯤 쓴 파일이 남지 않게
}

export function queueCounts(q) {
  const items = Object.values(q.items);
  return {
    evidence: items.filter((x) => x.stage === "evidence").length,
    draft: items.filter((x) => x.stage === "draft").length,
    meta: Object.values(q.meta).reduce((n, l) => n + l.length, 0),
    retrySources: Object.keys(q.retry).length,
  };
}
