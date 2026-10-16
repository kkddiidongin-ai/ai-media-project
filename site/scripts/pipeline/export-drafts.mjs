#!/usr/bin/env node
/**
 * 자동 생성 초안 → 편집 원고 파일(editorial-drafts.json) (Phase 7.2)
 *
 *   node scripts/pipeline/export-drafts.mjs <run 폴더> [--out <file>]
 *
 * run 폴더(ingest/daily/<날짜> 또는 backfill-…)의 drafts/<id>.json(초안 기록)을 모아, 편집 원고 형식으로 바꾼다.
 * 이 파일은 daily:check-drafts · daily:apply-drafts · 발행 workflow가 그대로 읽는다 (수동 원고와 같은 형식).
 *   verdict PUBLISHABLE: 초안 QA PASS · 원고 검증 오류 없음 · 확인 필요 항목 없음 · mock 아님 · 원고 점검(daily:check-drafts) 통과
 *   verdict REVIEW: 그 밖 (편집자가 고친 뒤 PUBLISHABLE로 바꿔야 발행 가능)
 * 근거 인용은 초안이 가리킨 근거 장부(E1…) 문장을 그대로 옮긴다 — 숫자 대조는 이 인용으로 한다.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkDraft } from "../daily/check-editorial-drafts.mjs";
import { loadExisting } from "../daily/lib.mjs";

const quoteOf = (ledger, ids) => (ids ?? []).map((id) => ledger.find((e) => e.id === id)?.text).filter(Boolean).join(" … ");

export function draftToEditorial(rec, candidate, { existing }) {
  const d = rec.draft;
  const ledger = rec.evidenceSummary?.ledger ?? [];
  const facts = (d.facts ?? []).map((f) => f.text);
  const evidence = [];
  (d.facts ?? []).forEach((f, i) => {
    const q = quoteOf(ledger, f.evidence);
    if (q) evidence.push({ fact: i + 1, url: rec.source.url, quote: q });
  });
  for (const [k, part] of [["why", d.why], ["change", d.change]]) {
    const q = quoteOf(ledger, part?.evidence);
    if (q) evidence.push({ fact: k, url: rec.source.url, quote: q });
  }
  const story = {
    slug: candidate?.proposedSlug ?? rec.candidateId,
    title: d.title,
    summary: d.summary,
    category: d.category,
    topics: d.topics ?? [],
    companies: d.companies ?? [],
    products: d.products ?? [],
    facts,
    whyItMatters: d.why?.text ?? "",
    whatChanges: d.change?.text ?? "",
    priority: candidate?.score?.importance >= 4 ? 1 : candidate?.score?.importance >= 3 ? 2 : 3,
    secondarySources: [],
    editorialDepth: String(d.editorialDepth ?? "SHORT").toLowerCase(),
    eventDate: String(rec.source.publishedAt).slice(0, 10),
    publishedAt: null,
    sourceType: rec.source.type ?? "official",
    sourceName: rec.source.name,
    sourceUrl: rec.source.url,
    sourcePublishedAt: rec.source.publishedAt,
    sourceTitle: rec.source.title,
    contentType: "NEWS",
    status: "draft",
  };
  const entry = { rank: null, verdict: "REVIEW", handsOn: false, relatedStory: rec.duplicate?.matchSlug ? { slug: rec.duplicate.matchSlug, relation: `자동 판정 ${rec.duplicate.result} — 편집자 확인` } : null, story, evidence, unverified: d.unknowns ?? [], generation: { provider: rec.generation.provider, model: rec.generation.model, generatedAt: rec.generation.generatedAt }, draftQa: rec.qa?.verdict ?? null };
  const reasons = [];
  if (rec.qa?.verdict !== "PASS") reasons.push(`초안 QA ${rec.qa?.verdict}`);
  if (!rec.approvable) reasons.push("승인 불가 초안 (mock 또는 QA FAIL)");
  if ((candidate?.needsReview ?? []).length) reasons.push(`확인 필요: ${candidate.needsReview.join(", ")}`);
  if (rec.generation?.provider === "mock") reasons.push("mock 원고");
  const qa = checkDraft(entry, existing);
  if (qa.verdict === "FAIL") reasons.push(`원고 점검 FAIL: ${qa.fail.slice(0, 3).join(" · ")}`);
  entry.verdict = reasons.length ? "REVIEW" : "PUBLISHABLE";
  entry.reviewReasons = reasons;
  return entry;
}

export function exportRun(runDir, { existing = loadExisting() } = {}) {
  const dDir = path.join(runDir, "drafts");
  const cDir = path.join(runDir, "candidates");
  const out = [];
  if (!fs.existsSync(dDir)) return { drafts: out };
  for (const f of fs.readdirSync(dDir).filter((x) => x.endsWith(".json") && !x.startsWith("editorial-drafts"))) {
    const rec = JSON.parse(fs.readFileSync(path.join(dDir, f), "utf8"));
    if (!rec.draft || !rec.candidateId) continue;
    const cf = path.join(cDir, `${rec.candidateId}.json`);
    const cand = fs.existsSync(cf) ? JSON.parse(fs.readFileSync(cf, "utf8")) : null;
    if (cand && cand.decision !== "PUBLISH") continue; // QA FAIL로 HOLD된 초안은 내보내지 않는다
    out.push(draftToEditorial(rec, cand, { existing }));
  }
  out.sort((a, b) => a.story.priority - b.story.priority || b.story.eventDate.localeCompare(a.story.eventDate));
  out.forEach((d, i) => (d.rank = i + 1));
  return { version: 2, generatedAt: new Date().toISOString(), status: "draft_for_editor_review", source: path.basename(runDir), drafts: out };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const dir = argv.find((a) => !a.startsWith("--"));
  const outI = argv.indexOf("--out");
  if (!dir || !fs.existsSync(dir)) {
    console.error("사용법: node scripts/pipeline/export-drafts.mjs <run 폴더> [--out file]");
    process.exit(1);
  }
  const doc = exportRun(dir);
  const file = outI >= 0 ? argv[outI + 1] : path.join(dir, "drafts", "editorial-drafts.json");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(doc, null, 2) + "\n");
  const pub = doc.drafts.filter((d) => d.verdict === "PUBLISHABLE").length;
  console.log(`원고 ${doc.drafts.length}건 → ${file} (발행 가능 ${pub} · 검토 필요 ${doc.drafts.length - pub})`);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `drafts=${doc.drafts.length}\npublishable=${pub}\nfile=${file}\n`);
}
