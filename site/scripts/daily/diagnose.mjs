#!/usr/bin/env node
/**
 * 선정 기준 진단 (Phase 7.1.5) — 실행 결과(run.json)를 읽기만 한다. 설정은 바꾸지 않는다.
 *
 *   npm run daily:diagnose -- <run.json 경로> [--out diagnostics.md]
 *
 * 보는 것: 우선순위별 후보 수 · PUBLISH/HOLD/EXCLUDE 분포 · 근거 확인 통과율 · 주요 기업 공식 발표가 추천되지 못한 비율 ·
 *          편집 가치가 있어 보이는데 HOLD된 사례 · 고객 사례·홍보성 글 비중 · 발행 추천 기준(PUBLISH_MIN) 6 유지안과 조정안 비교.
 * 조정안 비교는 '근거 확인을 통과하고 깊이가 정해진 후보' 가운데 우선순위가 기준 이상인 수를 세는 시뮬레이션이다
 * (하루 추천 상한·회사 다양성은 반영하지 않으므로 실제 추천 수의 상한값이다).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PUBLISH_MIN, SHORTLIST_MIN } from "./select.mjs";

export const MAJOR = ["OpenAI", "Anthropic", "Google", "Microsoft", "Meta", "NVIDIA", "Amazon", "Apple", "Samsung", "xAI", "Mistral AI", "Mistral", "GitHub"];
const PROMO_TYPES = new Set(["CUSTOMER_STORY", "INDUSTRY_STORY", "MARKETING", "THOUGHT_LEADERSHIP", "EVENT", "HIRING"]);
const cell = (s) => String(s ?? "").replace(/\|/g, "/").replace(/\n/g, " ");
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : "-");

/** 숫자만 모은다 (보고서·시험 공용) */
export function diagnoseRun(run) {
  const items = run.items ?? [];
  const byPriority = {};
  for (const x of items) byPriority[x.score] = (byPriority[x.score] ?? 0) + 1;
  const decisions = { PUBLISH: 0, HOLD: 0, EXCLUDE: 0 };
  for (const x of items) decisions[x.decision] = (decisions[x.decision] ?? 0) + 1;
  const checked = items.filter((x) => x.stage === "evidence");
  const evidenceOk = checked.filter((x) => x.evidenceStatus === "OK");
  const sufficient = checked.filter((x) => x.suggestedDepth);
  const live = items.filter((x) => x.duplicate === "NEW" || x.duplicate === "UPDATE_EXISTING");
  const official = live.filter((x) => MAJOR.includes(x.company) && !PROMO_TYPES.has(x.contentType));
  const officialMissed = official.filter((x) => x.decision !== "PUBLISH");
  const promo = live.filter((x) => PROMO_TYPES.has(x.contentType));
  // 편집 가치 신호: 근거 충분 + 우선순위가 근거 확인 대상 이상인데 HOLD (기준 미달·상한·다양성)
  const valuableHold = items.filter((x) => x.decision === "HOLD" && x.suggestedDepth && x.score >= SHORTLIST_MIN);
  const simulate = (t) => sufficient.filter((x) => x.score >= t && x.duplicate !== "DUPLICATE" && x.duplicate !== "UNCERTAIN" && !x.carriedFrom);
  const thresholds = [PUBLISH_MIN, 5, 4].map((t) => {
    const hits = simulate(t);
    return { threshold: t, count: hits.length, promo: hits.filter((x) => PROMO_TYPES.has(x.contentType)).length, items: hits };
  });
  return { total: items.length, byPriority, decisions, checked: checked.length, evidenceOk: evidenceOk.length, sufficient: sufficient.length, official, officialMissed, promo, live: live.length, valuableHold, thresholds };
}

export function renderDiagnostics(run, d = diagnoseRun(run)) {
  const L = [];
  const title = run.kind === "backfill" ? `${run.backfill.from} ~ ${run.backfill.to} 백필` : run.date;
  L.push(`# 선정 기준 진단 — ${title}`, "");
  L.push(`> 진단만 합니다. 발행 추천 기준(PUBLISH_MIN = ${PUBLISH_MIN})과 설정은 바꾸지 않았습니다.`, "");
  L.push("## 분포", "");
  L.push(`- 후보 ${d.total}건 · 신규/후속 ${d.live}건 · PUBLISH ${d.decisions.PUBLISH} · HOLD ${d.decisions.HOLD} · EXCLUDE ${d.decisions.EXCLUDE}`);
  L.push(`- 우선순위별: ${Object.entries(d.byPriority).sort((a, b) => Number(b[0]) - Number(a[0])).map(([k, v]) => `${k}점 ${v}`).join(" · ")}`);
  L.push(`- 근거 확인 ${d.checked}건 → 원문 OK ${d.evidenceOk} (${pct(d.evidenceOk, d.checked)}) · 근거 충분(깊이 판정) ${d.sufficient} (${pct(d.sufficient, d.checked)})`);
  L.push(`- 고객 사례·홍보성 글: 신규 ${d.live}건 중 ${d.promo.length}건 (${pct(d.promo.length, d.live)})`);
  L.push(`- 주요 기업 공식 발표(홍보성 제외): ${d.official.length}건 중 추천 안 됨 ${d.officialMissed.length}건 (${pct(d.officialMissed.length, d.official.length)})`, "");
  L.push("## 발행 추천 기준 비교 (시뮬레이션 — 실제 설정은 그대로)", "");
  L.push("| 기준 | 추천 가능 후보 | 그중 홍보성 | 비고 |", "|---|---|---|---|");
  for (const t of d.thresholds) L.push(`| ${t.threshold}${t.threshold === PUBLISH_MIN ? " (현재)" : ""} | ${t.count} | ${t.promo} | ${t.items.slice(0, 4).map((x) => cell(x.title).slice(0, 40)).join(" · ")}${t.items.length > 4 ? " …" : ""} |`);
  L.push("", "근거가 충분한 후보 중 우선순위가 기준 이상인 수입니다 (하루 추천 상한·회사 다양성 미반영).", "");
  L.push(`## 편집 가치가 있어 보이는데 HOLD된 후보 (${d.valuableHold.length})`, "");
  if (!d.valuableHold.length) L.push("없음");
  for (const x of d.valuableHold) L.push(`- ${cell(x.title)} — ${x.source} · ${String(x.publishedAt).slice(0, 10)} · 우선순위 ${x.score} · 유형 ${x.contentType} · 깊이 ${x.suggestedDepth} · ${cell((x.reasons ?? []).at(-1))}`);
  L.push("");
  L.push(`## 추천되지 않은 주요 기업 공식 발표 (${d.officialMissed.length})`, "");
  if (!d.officialMissed.length) L.push("없음");
  L.push(...d.officialMissed.slice(0, 40).map((x) => `- ${x.decision} · ${cell(x.title)} — ${x.source} · ${String(x.publishedAt).slice(0, 10)} · 우선순위 ${x.score} · ${cell((x.reasons ?? []).at(-1)).slice(0, 120)}`));
  L.push("");
  return L.join("\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const file = argv.find((a) => !a.startsWith("--"));
  const outI = argv.indexOf("--out");
  if (!file || !fs.existsSync(file)) {
    console.error("사용법: npm run daily:diagnose -- <run.json> [--out diagnostics.md]");
    process.exitCode = 1;
  } else {
    const md = renderDiagnostics(JSON.parse(fs.readFileSync(file, "utf8")));
    if (outI >= 0) fs.writeFileSync(argv[outI + 1], md);
    else console.log(md);
  }
}
