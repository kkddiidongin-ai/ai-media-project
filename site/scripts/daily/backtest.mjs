#!/usr/bin/env node
/**
 * DAILY 백테스트 (Phase 7.1.2) — 지금 피드를 과거 시점의 완전한 데이터처럼 쓰지 않는다.
 *
 *   node scripts/daily/backtest.mjs [--dates 2026-10-05,2026-10-06,2026-10-07] [--out ingest/log/backtest] [--no-fetch]
 *
 * 각 날짜 D를 'D 07:00 KST(= D-1 22:00 UTC)에 돌았다면'으로 재현한다.
 *  - 항목: 보존된 피드 스냅숏(fixtures/2026-10-07-metadata.json, capturedAt 기록) 중 실행 시각 이전 발표만
 *          + ingest/candidates의 후보 기록(사후 보존 — origin: candidates로 표시)
 *  - 기존 기사: D 이전에 사람이 발행한 기사만 (D 이후 발행분은 '아직 없던 기사')
 *  - 근거: 원문을 지금 다시 읽는다 (당시와 다를 수 있음 — 보고서에 표시). --no-fetch면 근거 단계 없이 메타데이터 판정만
 *  - LLM 호출 없음 (Shadow Mode)
 * 평가: 사람이 발행한 기사(원 발표일이 창 안)를 기준으로 recall · 잘못된 추천 후보 · 누락 이유 · 403 · 중복 판정.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ROOT, canonicalUrl, loadAllCandidates } from "../ingest/lib.mjs";
import { loadExisting } from "./lib.mjs";
import { runDaily } from "./run.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
export const runTimeOf = (d) => `${addDays(d, -1)}T22:00:00.000Z`; // D 07:00 KST

/** D 시점에 '알 수 있었던' 항목과 자료 범위 */
export function itemsAsOf(date, { snapshot, candidates, windowDays = 2 }) {
  const since = addDays(date, -windowDays);
  const runTime = runTimeOf(date);
  const inWin = (iso) => iso && iso.slice(0, 10) >= since && iso.slice(0, 10) <= date && iso <= runTime;
  const snap = snapshot.items.filter((i) => inWin(i.publishedAt)).map((i) => ({ ...i, origin: "snapshot", fetchedAt: snapshot.capturedAt }));
  const ids = new Set(snap.map((i) => i.id));
  const cand = [...candidates.values()]
    .filter((c) => inWin(c.publishedAt) && !ids.has(c.id) && c.datePrecision !== "month")
    .map((c) => ({ id: c.id, url: c.url, canonicalUrl: canonicalUrl(c.url), title: c.title, excerpt: (c.description ?? "").slice(0, 300), publishedAt: c.publishedAt, sourceId: c.sourceId, sourceName: c.sourceName, sourceType: c.sourceType, tier: c.tier, fetchMode: c.fetchMode, origin: "candidates" }));
  // 스냅숏이 덮지 못하는 날 (스냅숏 수집 창 시작 이전)
  const uncovered = [];
  for (let d = since; d <= date; d = addDays(d, 1)) if (d < snapshot.window.since) uncovered.push(d);
  return { since, runTime, items: [...snap, ...cand], coverage: { snapshotItems: snap.length, candidateItems: cand.length, uncoveredDays: uncovered } };
}

/** D 이전에 사람이 발행한 기사만 '기존'으로 */
export function existingAsOf(date, full) {
  const stories = full.stories.filter((s) => s.publishedAt < date);
  const editorialIds = new Set(stories.flatMap((s) => [s.candidateId, ...(s.secondarySources ?? []).map((x) => x.candidateId)]).filter(Boolean));
  return { ...full, stories, editorialIds, editorialSlugs: new Set(stories.map((s) => s.slug)) };
}

/** 사람 발행 기사 대비 평가 */
export function evaluate(date, run, full, asOf) {
  const since = asOf.since;
  const truth = full.stories.filter((s) => s.eventDate >= since && s.eventDate <= date);
  const byId = new Map(run.items.map((i) => [i.id, i]));
  const byUrl = new Map(run.items.map((i) => [canonicalUrl(i.url), i]));
  const rows = truth.map((s) => {
    const it = byId.get(s.candidateId) ?? byUrl.get(canonicalUrl(s.sourceUrl));
    const knowable = s.sourcePublishedAt <= asOf.runTime;
    const humanBefore = s.publishedAt < date;
    let outcome;
    if (!knowable) outcome = "NOT_YET"; // 실행 시각에는 아직 발표 전 → 다음 실행 대상
    else if (!it) outcome = "NOT_IN_DATA";
    else if (humanBefore) outcome = it.duplicate === "DUPLICATE" ? "DUP_OK" : "DUP_MISSED";
    else outcome = it.decision === "PUBLISH" ? "RECOMMENDED" : it.stage === "evidence" ? "SHORTLISTED_NOT_RECOMMENDED" : "MISSED";
    return { slug: s.slug, eventDate: s.eventDate, sourcePublishedAt: s.sourcePublishedAt, humanPublishedAt: s.publishedAt, outcome, decision: it?.decision ?? null, reasons: it?.reasons ?? [], evidenceStatus: it?.evidenceStatus ?? null, origin: it ? (asOf.items.find((x) => x.id === it.id)?.origin ?? null) : null };
  });
  const expected = rows.filter((r) => ["RECOMMENDED", "SHORTLISTED_NOT_RECOMMENDED", "MISSED"].includes(r.outcome));
  const truthIds = new Set(truth.flatMap((s) => [s.candidateId, canonicalUrl(s.sourceUrl)]));
  const extra = run.items.filter((i) => i.decision === "PUBLISH" && !truthIds.has(i.id) && !truthIds.has(canonicalUrl(i.url)));
  const blocked = run.items.filter((i) => /HTTP_403|ROBOTS|BLOCKED/.test(i.evidenceStatus ?? ""));
  const dupWrong = rows.filter((r) => r.outcome === "DUP_MISSED");
  const uncertain = run.items.filter((i) => i.duplicate === "UNCERTAIN");
  return {
    date,
    truth: rows,
    recall: expected.length ? { recommended: expected.filter((r) => r.outcome === "RECOMMENDED").length, shortlisted: expected.filter((r) => r.outcome !== "MISSED").length, of: expected.length } : null,
    notInData: rows.filter((r) => r.outcome === "NOT_IN_DATA").length,
    recommendedNotPublishedByHuman: extra.map((i) => ({ title: i.title, source: i.source, contentType: i.contentType, importance: i.importance, signals: i.signals })),
    blocked: blocked.map((i) => ({ title: i.title, source: i.source, status: i.evidenceStatus, alternate: i.alternate ?? null })),
    duplicateMisjudged: dupWrong,
    uncertain: uncertain.map((i) => ({ title: i.title, matchSlug: i.matchSlug, reasons: i.reasons })),
  };
}

function summaryMd(results) {
  const L = ["# DAILY 백테스트 요약", ""];
  L.push("각 날짜를 '그날 07:00 KST에 돌았다면'으로 재현. 피드 스냅숏은 2026-10-07 15:30 UTC에 수집한 것 하나뿐이라 그 이전 날짜는 자료가 부분적이다. 근거 원문은 지금 다시 읽었다 (당시와 다를 수 있음). LLM 호출 없음.", "");
  for (const { asOf, ev, run } of results) {
    L.push(`## ${ev.date} (실행 시각 ${asOf.runTime}, 창 ${asOf.since}~${ev.date})`, "");
    L.push(`- 자료: 스냅숏 ${asOf.coverage.snapshotItems}건 + 후보 기록 ${asOf.coverage.candidateItems}건${asOf.coverage.uncoveredDays.length ? ` · **스냅숏 없는 날 ${asOf.coverage.uncoveredDays.join(", ")}** (그날 발표는 평가 불가)` : ""}`);
    L.push(`- 판정: 발행 추천 ${run.counts.PUBLISH} · 보류 ${run.counts.HOLD} · 제외 ${run.counts.EXCLUDE} · 근거 확인 ${run.counts.evidenceChecked} · 중복 ${run.counts.DUPLICATE} · 불확실 ${run.counts.UNCERTAIN}`);
    L.push(`- 사람 발행 기사 대비 recall: ${ev.recall ? `추천 ${ev.recall.recommended}/${ev.recall.of} · 근거 확인까지 ${ev.recall.shortlisted}/${ev.recall.of}` : "평가 대상 없음"}`);
    for (const t of ev.truth) L.push(`  - \`${t.slug}\` (발표 ${t.eventDate}, 사람 발행 ${t.humanPublishedAt}) → **${t.outcome}**${t.decision ? ` · ${t.decision}` : ""}${t.evidenceStatus ? ` · 원문 ${t.evidenceStatus}` : ""}${t.reasons.length ? ` · ${t.reasons.at(-1)}` : ""}`);
    L.push(`- 사람이 발행하지 않은 추천 ${ev.recommendedNotPublishedByHuman.length}건: ${ev.recommendedNotPublishedByHuman.map((x) => `${x.title.slice(0, 50)} (${x.source})`).join(" · ") || "없음"}`);
    L.push(`- 원문 차단: ${ev.blocked.map((x) => `${x.title.slice(0, 40)} ${x.status}${x.alternate ? ` (대체 문서 ${x.alternate.matched}줄)` : ""}`).join(" · ") || "없음"}`);
    L.push(`- 중복 오판: ${ev.duplicateMisjudged.map((x) => x.slug).join(", ") || "없음"} · 불확실 ${ev.uncertain.length}건${ev.uncertain.length ? `: ${ev.uncertain.map((x) => `${x.title.slice(0, 40)} → ${x.matchSlug}`).join(" · ")}` : ""}`, "");
  }
  return L.join("\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const arg = (k) => {
    const i = argv.indexOf(k);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const dates = (arg("--dates") ?? "2026-10-05,2026-10-06,2026-10-07").split(",");
  const out = path.resolve(arg("--out") ?? path.join(ROOT, "ingest/log/backtest"));
  const snapshot = JSON.parse(fs.readFileSync(path.join(HERE, "fixtures/2026-10-07-metadata.json"), "utf8"));
  const full = loadExisting();
  const candidates = loadAllCandidates();
  const results = [];
  for (const date of dates) {
    const asOf = itemsAsOf(date, { snapshot, candidates });
    const existing = existingAsOf(date, full);
    const env = { DAILY_AUTOMATION_ENABLED: "true", DAILY_MODE: "shadow", DAILY_LLM_PROVIDER: "none", ...(argv.includes("--no-fetch") ? { DAILY_MAX_EVIDENCE_FETCHES: "0" } : {}) };
    const sources = [{ id: "snapshot", name: `피드 스냅숏 (${snapshot.capturedAt})`, status: "success" }, { id: "candidates", name: "후보 기록 (사후 보존)", status: "success" }];
    const note = `${date} 07:00 KST 재현 · 스냅숏 ${asOf.coverage.snapshotItems} + 후보 기록 ${asOf.coverage.candidateItems}${asOf.coverage.uncoveredDays.length ? ` · 스냅숏 없는 날 ${asOf.coverage.uncoveredDays.join(", ")}` : ""} · 근거 원문은 현재 상태`;
    const r = await runDaily({ date, out, env, items: asOf.items, sources, since: asOf.since, existing, processedFile: path.join(out, `processed-${date}.json`), backtest: { note, runTime: asOf.runTime, coverage: asOf.coverage }, log: () => {} });
    const ev = evaluate(date, r.run, full, asOf);
    results.push({ asOf, ev, run: r.run });
    console.log(`${date}: 자료 ${asOf.items.length}건 · 추천 ${r.run.counts.PUBLISH} · recall ${ev.recall ? `${ev.recall.recommended}/${ev.recall.of}` : "-"} · 데이터 없음 ${ev.notInData}`);
  }
  fs.writeFileSync(path.join(out, "summary.json"), JSON.stringify(results.map((x) => ({ asOf: { since: x.asOf.since, runTime: x.asOf.runTime, coverage: x.asOf.coverage }, ...x.ev })), null, 2) + "\n");
  fs.writeFileSync(path.join(out, "summary.md"), summaryMd(results));
  console.log(`→ ${path.relative(process.cwd(), path.join(out, "summary.md"))}`);
}
