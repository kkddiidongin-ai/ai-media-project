#!/usr/bin/env node
/**
 * 사용법
 *   node scripts/ingest/run.mjs --mode backfill --from 2026-01-01 [--to YYYY-MM-DD] [--only openai,anthropic]
 *   node scripts/ingest/run.mjs --mode incremental            (소스별 마지막 수집 3일 전부터 오늘까지)
 *
 * 결과
 *   ingest/candidates/YYYY-MM.json   정규화·중복 제거된 후보 (id = 정규 URL의 해시)
 *   ingest/state.json                소스별 마지막 수집 시각
 *   ingest/log/<run>.json            실행 기록 (어디서 몇 개를 찾았는지, 오류)
 *
 * 후보는 아직 기사가 아니다. 편집(사람/Claude)이 사실을 확인하고 새로 쓴 것만 content/stories에 들어간다.
 */
import path from "node:path";
import { collectors } from "./collectors.mjs";
import {
  LOG_DIR,
  REGISTRY_FILE,
  STATE_FILE,
  candidateId,
  canonicalUrl,
  isAiRelevant,
  isoDate,
  loadAllCandidates,
  readJson,
  saveCandidates,
  today,
  writeJson,
} from "./lib.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith("--")) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith("--") ? arr[i + 1] : true]);
    return acc;
  }, []),
);
const mode = args.mode ?? "incremental";
const until = args.to ?? today();
const only = typeof args.only === "string" ? new Set(args.only.split(",")) : null;
const MAX_PAGED = Number(args.maxPages ?? 60);
const MAX_META = Number(args.maxMeta ?? 600);

const registry = readJson(REGISTRY_FILE, { sources: [] });
const state = readJson(STATE_FILE, { sources: {} });

function sinceFor(src) {
  if (mode === "backfill") return args.from ?? "2026-01-01";
  const last = state.sources[src.id]?.lastRunAt;
  if (!last) return args.from ?? "2026-01-01";
  const d = new Date(Date.parse(last) - 3 * 86400000); // 3일 겹쳐서 누락 방지 (중복은 id로 걸러짐)
  return d.toISOString().slice(0, 10);
}

const inRange = (iso, since) => iso && iso.slice(0, 10) >= since && iso.slice(0, 10) <= until;



async function main() {
  const startedAt = new Date().toISOString();
  const candidates = loadAllCandidates();
  const run = { runId: startedAt.replace(/[:.]/g, "").slice(0, 15), mode, until, startedAt, sources: [] };

  for (const src of registry.sources) {
    if (only && !only.has(src.id)) continue;
    if (!src.enabled || !collectors[src.fetchMode]) {
      run.sources.push({ id: src.id, skipped: src.note ?? "disabled" });
      continue;
    }
    const since = sinceFor(src);
    const stats = { id: src.id, since, requests: 0, found: 0, inRange: 0, irrelevant: 0, new: 0, duplicate: 0, skippedKnown: 0, errors: [] };
    try {
      const items = await collectors[src.fetchMode](src, since, stats, { maxPaged: MAX_PAGED, maxMeta: MAX_META, known: candidates });
      stats.found = items.length;
      for (const it of items) {
        const publishedAt = isoDate(it.date);
        if (!inRange(publishedAt, since)) continue;
        stats.inRange++;
        if (src.relevance === "ai" && !isAiRelevant(it)) {
          stats.irrelevant++;
          continue;
        }
        const id = candidateId(it.idKey ?? it.url);
        if (candidates.has(id)) {
          stats.duplicate++;
          continue;
        }
        candidates.set(id, {
          id,
          url: it.url,
          canonicalUrl: canonicalUrl(it.url),
          title: it.title,
          description: it.description.slice(0, 600),
          publishedAt,
          ...(it.datePrecision ? { datePrecision: it.datePrecision } : {}),
          sourceId: src.id,
          sourceName: src.name,
          sourceType: src.sourceType,
          tier: src.tier,
          fetchMode: src.fetchMode,
          discoveredVia: it.discoveredVia,
          discoveredAt: startedAt,
          runId: run.runId,
          status: "candidate",
        });
        stats.new++;
      }
      state.sources[src.id] = { lastRunAt: startedAt, lastMode: mode };
    } catch (e) {
      stats.errors.push(e.message);
    }
    run.sources.push(stats);
    console.log(
      `${src.id.padEnd(16)} since ${since} · req ${stats.requests} · found ${stats.found} · in range ${stats.inRange} · new ${stats.new} · dup ${stats.duplicate}${stats.errors.length ? ` · errors ${stats.errors.length}` : ""}`,
    );
  }

  saveCandidates(candidates);
  run.finishedAt = new Date().toISOString();
  run.totalCandidates = candidates.size;
  writeJson(STATE_FILE, state);
  writeJson(path.join(LOG_DIR, `${run.runId}-${mode}.json`), run);
  console.log(`\ncandidates total: ${candidates.size}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
