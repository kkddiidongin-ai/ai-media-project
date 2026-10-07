#!/usr/bin/env node
/**
 * DAILY 승인 (사람이 직접 실행)
 *
 *   npm run daily:approve -- <YYYY-MM-DD> <candidate-id> [--ack flag1,flag2] [--slug my-slug] [--dry-run] [--queue <dir>] [--no-publish]
 *
 * 승인 대기열(ingest/daily/<날짜>/candidates/<id>.json)의 원고를 기존 발행 구조로 옮긴다.
 *   1. 검사: 승인 대기 상태 · 실제 원고(mock 아님) · 판정 PUBLISH · 깊이 SHORT/STANDARD(DEEP은 사람이 deep 원고 작성)
 *            · 원고 검증 오류 없음 · 확인 필요 항목을 모두 --ack로 확인 · 중복 재확인 · 원문 재확인 · slug 형식/중복
 *   2. ingest/candidates/<월>.json 끝에 출처 기록 1건 추가 (이미 있으면 그대로)
 *   3. ingest/editorial/<월>.json 끝에 편집 원고 1건 추가 (editorialDepth 명시)
 *   4. node scripts/ingest/publish.mjs 실행 → 실패하면 2·3을 되돌린다
 * commit·push·배포는 하지 않는다. 이어서 npm run publish:daily로 전체 QA를 돌리고 사람이 확인해 커밋한다.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { CATEGORIES, ROOT, canonicalUrl, politeFetch, readJson, robotsAllowed } from "../ingest/lib.mjs";
import { DAILY_DIR, dedupeItem, loadExisting, validateDraft } from "./lib.mjs";

export async function approve({ date, id, ack = [], slug, dryRun = false, queueDir = DAILY_DIR, publish = true, recheckSource = true, log = console.log }) {
  const problems = [];
  const file = path.join(queueDir, String(date), "candidates", `${id}.json`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date)) || !/^[a-f0-9]{12}$/.test(String(id))) return { ok: false, problems: ["날짜(YYYY-MM-DD)와 후보 id(12자리)가 필요합니다"] };
  const q = readJson(file, null);
  if (!q) return { ok: false, problems: [`승인 대기열에 없음: ${path.relative(ROOT, file)}`] };

  if (q.approval?.status !== "pending") problems.push(`이미 처리됨 (${q.approval?.status})`);
  if (q.decision !== "PUBLISH") problems.push(`판정이 ${q.decision} — PUBLISH만 승인할 수 있음`);
  if (!q.draft || q.generation?.status !== "ok") problems.push("원고 없음 (생성되지 않았거나 실패)");
  if (q.generation?.provider === "mock") problems.push("mock 원고는 승인할 수 없음");
  if (q.draft && !["SHORT", "STANDARD"].includes(q.draft.editorialDepth)) problems.push(`깊이 ${q.draft.editorialDepth} — 자동 원고는 SHORT·STANDARD만 승인 (DEEP은 사람이 deep 원고 작성)`);
  if (q.validation?.errors?.length) problems.push(`원고 검증 오류: ${q.validation.errors.join(" · ")}`);
  const unacked = (q.needsReview ?? []).filter((f) => !ack.includes(f));
  if (unacked.includes("deep_requires_editor")) problems.push("DEEP 제안 항목 — 사람이 심층 원고로 작성");
  if (unacked.length) problems.push(`확인 필요 항목을 검토한 뒤 --ack ${unacked.join(",")} 로 표시하세요`);

  // 지금 기준으로 다시 검사 (대기열이 만들어진 뒤 다른 기사가 발행됐을 수 있다)
  const existing = loadExisting();
  if (q.draft) {
    const dup = dedupeItem(q.candidate, existing);
    if (dup.result === "DUPLICATE") problems.push(`지금은 중복: ${dup.reason}${dup.matchSlug ? ` (${dup.matchSlug})` : ""}`);
    if (dup.result === "UNCERTAIN" && !ack.includes("duplicate_uncertain")) problems.push(`중복 불확실: ${dup.reason} — 확인 후 --ack duplicate_uncertain`);
    const v = validateDraft(q.draft, { item: q.candidate, evidence: q.evidence, existing, dup });
    if (v.errors.length) problems.push(`재검증 오류: ${v.errors.join(" · ")}`);
    const newFlags = v.needsReview.filter((f) => !ack.includes(f) && !(q.needsReview ?? []).includes(f));
    if (newFlags.length) problems.push(`새로 생긴 확인 필요 항목: ${newFlags.join(", ")}`);
  }
  const finalSlug = slug ?? q.proposedSlug;
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(finalSlug ?? "")) problems.push(`slug 형식 오류: ${finalSlug}`);
  if (existing.stories.some((s) => s.slug === finalSlug) || existing.editorialSlugs.has(finalSlug)) problems.push(`slug ${finalSlug}가 이미 있음 (--slug로 바꾸기)`);
  if (q.draft && !CATEGORIES.includes(q.draft.category)) problems.push(`category ${q.draft.category} 없음`);
  if (q.candidate?.datePrecision === "month") problems.push("발표일(일자) 미상 — 발행 불가");

  // 원문 재확인 (robots 존중, 우회 없음)
  if (recheckSource && !problems.length) {
    try {
      if (!(await robotsAllowed(q.candidate.url))) {
        if (!ack.includes("source_blocked")) problems.push("원문 robots 차단 — 확인 후 --ack source_blocked");
      } else {
        const r = await politeFetch(q.candidate.url.split("#")[0], { accept: "text/html" });
        await r.body?.cancel();
        if (!r.ok && !ack.includes("source_blocked")) problems.push(`원문 HTTP ${r.status} — 확인 후 --ack source_blocked`);
      }
    } catch (e) {
      if (!ack.includes("source_blocked")) problems.push(`원문 접속 실패 (${e?.name ?? "error"}) — 확인 후 --ack source_blocked`);
    }
  }
  if (problems.length) return { ok: false, problems };

  const c = q.candidate;
  const month = c.publishedAt.slice(0, 7);
  const candFile = path.join(ROOT, "ingest", "candidates", `${month}.json`);
  const edFile = path.join(ROOT, "ingest", "editorial", `${month}.json`);
  const candRecord = {
    id: c.id,
    url: c.url,
    canonicalUrl: canonicalUrl(c.url),
    title: c.title,
    description: c.excerpt ?? "",
    publishedAt: c.publishedAt,
    sourceId: c.sourceId,
    sourceName: c.sourceName,
    sourceType: c.sourceType,
    tier: c.tier,
    fetchMode: c.fetchMode,
    discoveredVia: c.discoveredVia,
    discoveredAt: c.fetchedAt,
    runId: `daily-${date}`,
    status: "candidate",
  };
  const d = q.draft;
  const edEntry = {
    c: c.id,
    slug: finalSlug,
    title: d.title,
    summary: d.summary,
    cat: d.category,
    topics: d.topics ?? [],
    companies: d.companies ?? [],
    products: d.products ?? [],
    facts: d.facts.map((f) => f.text),
    why: d.why.text,
    change: d.change.text,
    prio: q.score.importance >= 4 ? 1 : q.score.importance >= 3 ? 2 : 3,
    editorialDepth: d.editorialDepth,
  };
  if (dryRun) return { ok: true, dryRun: true, slug: finalSlug, files: [candFile, edFile], edEntry };

  const backup = new Map([candFile, edFile].map((f) => [f, fs.existsSync(f) ? fs.readFileSync(f, "utf8") : null]));
  const restore = () => {
    for (const [f, txt] of backup) {
      if (txt === null) fs.rmSync(f, { force: true });
      else fs.writeFileSync(f, txt);
    }
  };
  try {
    const cands = readJson(candFile, []);
    if (!cands.some((x) => x.id === c.id)) fs.writeFileSync(candFile, JSON.stringify([...cands, candRecord], null, 2) + "\n");
    fs.writeFileSync(edFile, JSON.stringify([...readJson(edFile, []), edEntry], null, 2) + "\n");
    if (publish) {
      const r = spawnSync(process.execPath, [path.join(path.dirname(fileURLToPath(import.meta.url)), "../ingest/publish.mjs")], { encoding: "utf8", env: process.env });
      if (r.status !== 0) {
        restore();
        return { ok: false, problems: [`publish.mjs 실패 — 되돌림:\n${(r.stdout + r.stderr).trim().slice(-800)}`] };
      }
      log(r.stdout.trim().split("\n").at(-1));
    }
  } catch (e) {
    restore();
    return { ok: false, problems: [`쓰기 실패 — 되돌림: ${e?.message ?? e}`] };
  }
  fs.writeFileSync(file, JSON.stringify({ ...q, approval: { status: "approved", at: new Date().toISOString(), slug: finalSlug, ack } }, null, 2) + "\n");
  return { ok: true, slug: finalSlug, files: [candFile, edFile] };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const arg = (k) => {
    const i = argv.indexOf(k);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const [date, id] = argv.filter((a, i) => !a.startsWith("--") && !argv[i - 1]?.startsWith("--"));
  const r = await approve({ date, id, ack: (arg("--ack") ?? "").split(",").filter(Boolean), slug: arg("--slug"), dryRun: argv.includes("--dry-run"), queueDir: arg("--queue") ?? DAILY_DIR, publish: !argv.includes("--no-publish") });
  if (!r.ok) {
    console.error("승인하지 않았습니다:\n- " + r.problems.join("\n- "));
    process.exitCode = 1;
  } else if (r.dryRun) {
    console.log(`검사 통과 (--dry-run, 쓰지 않음) · slug ${r.slug}`);
  } else {
    console.log(`승인 완료 · ${r.slug}\n다음: npm run publish:daily (전체 QA·빌드) → 변경 확인 → 커밋·푸시·배포는 사람이 직접`);
  }
}
