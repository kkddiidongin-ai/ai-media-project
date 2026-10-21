#!/usr/bin/env node
/**
 * 편집 원고(사람·편집자가 쓴 승인 대기 원고) 점검 — 외부 접속 없음, 기사 데이터 변경 없음
 *
 *   npm run daily:check-drafts -- <editorial-drafts.json>
 *
 * 원고 파일 형식: { drafts: [{ story, evidence: [{fact, url, quote}], relatedStory?, unverified?, handsOn }] }
 * 확인하는 것
 *   - 숫자: 원고의 모든 숫자가 근거 인용문(evidence.quote) · 발표일 · 관련 기존 기사 발표일에 있어야 한다 (없으면 FAIL)
 *   - 품질: 기사 편집 품질 규칙(qa:quality와 같은 규칙)이 FAIL이면 FAIL, REVIEW는 그대로 보고
 *   - 중복: 기존 기사와 같은 원문·slug면 FAIL. 관련 기존 기사가 있으면 relatedStory로 명시해야 한다
 *   - 형식: 상태 draft · publishedAt 미정 · eventDate 날짜 · https 원문 · 근거 인용 1개 이상/사실
 *   - 표현: 직접 사용·측정한 것처럼 쓴 문장 금지 (handsOn: false)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { audit } from "../qa/quality-rules.mjs";
import { aliasUrl, dedupeItem, loadExisting } from "./lib.mjs";
import { canonicalUrl } from "../ingest/lib.mjs";

const FAKE_EXPERIENCE = /(직접 써|직접 사용해|써 보니|써봤|사용해 보니|테스트해 보니|직접 재|실제로 돌려 보니)/;
const WORD_NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, twenty: 20, thirty: 30 };

/** 숫자 값 모음. '100만'·'1M'·'million'은 1,000,000배로, 영어 수 단어는 숫자로 */
export function numberValues(text, { korean = false } = {}) {
  let t = String(text ?? "");
  const out = new Set();
  if (korean) {
    for (const m of t.matchAll(/(\d+(?:[.,]\d+)*)\s*만/g)) out.add(Number(m[1].replace(/,/g, "")) * 10000);
    t = t.replace(/(\d+(?:[.,]\d+)*)\s*만/g, " ");
  } else {
    for (const m of t.matchAll(/(\d+(?:\.\d+)?)\s*(M\b|million)/gi)) out.add(Number(m[1]) * 1_000_000);
    if (/\bper million\b/i.test(t)) out.add(1_000_000);
    for (const m of t.matchAll(/\b([A-Za-z]+)\b/g)) if (WORD_NUM[m[1].toLowerCase()]) out.add(WORD_NUM[m[1].toLowerCase()]);
    for (const m of t.matchAll(/(\d+)\s*k\b/gi)) out.add(Number(m[1]) * 1000);
    // 영어 날짜의 달 이름 (November 30 → 11월 30일과 대조)
    const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
    for (const m of t.matchAll(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/g)) out.add(MONTHS.indexOf(m[1].toLowerCase()) + 1);
  }
  for (const m of t.matchAll(/\d+(?:,\d{3})*(?:\.\d+)?/g)) out.add(Number(m[0].replace(/,/g, "")));
  return out;
}

export function checkDraft(d, existing) {
  const s = d.story;
  const fail = [];
  const review = [];
  const fields = [s.title, s.summary, ...(s.facts ?? []), s.whyItMatters, s.whatChanges];
  // 형식
  if (s.status !== "draft") fail.push(`상태가 ${s.status} — 승인 전 원고는 draft`);
  if (s.publishedAt !== null) fail.push("publishedAt은 발행 시점에 정한다 (원고에서는 null)");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.eventDate ?? "")) fail.push("eventDate(발표일) 없음");
  if (!/^https:\/\//.test(s.sourceUrl ?? "")) fail.push("원문 주소 없음");
  if (d.handsOn !== false) fail.push("handsOn은 false여야 함 (직접 사용·측정하지 않은 원고)");
  for (const [i] of (s.facts ?? []).entries()) if (!(d.evidence ?? []).some((e) => e.fact === i + 1 && e.quote)) fail.push(`사실 ${i + 1}에 근거 인용 없음`);
  for (const e of d.evidence ?? []) if (!/^https:\/\//.test(e.url ?? "")) fail.push(`근거 주소 형식 (${e.fact})`);
  // 숫자: 근거 인용 · 발표일 · 관련 기사 발표일에 있어야
  const related = d.relatedStory ? existing.stories.find((x) => x.slug === d.relatedStory.slug) : null;
  const allowed = new Set();
  for (const e of d.evidence ?? []) for (const v of numberValues(e.quote)) allowed.add(v);
  for (const date of [s.eventDate, related?.eventDate].filter(Boolean)) for (const p of date.split("-")) allowed.add(Number(p));
  for (const p of String(s.slug).match(/\d+/g) ?? []) allowed.add(Number(p));
  for (const t of fields) {
    const bad = [...numberValues(t, { korean: true })].filter((v) => !allowed.has(v));
    if (bad.length) fail.push(`근거에 없는 숫자 ${bad.join(", ")} — "${String(t).slice(0, 50)}…"`);
  }
  // 표현
  for (const t of fields) if (FAKE_EXPERIENCE.test(t ?? "")) fail.push(`직접 사용한 것처럼 쓴 문장: "${String(t).slice(0, 40)}…"`);
  // 품질 규칙 (기존 기사와 같은 기준)
  const q = audit({ ...s, sourceUrl: s.sourceUrl });
  if (q.status === "FAIL") fail.push(`편집 품질 FAIL: ${q.reasons.join(", ")}`);
  else if (q.status === "REVIEW") review.push(`편집 품질 REVIEW: ${q.reasons.join(", ")}`);
  // 중복
  if (existing.stories.some((x) => x.slug === s.slug)) fail.push(`이미 있는 slug ${s.slug}`);
  const item = { id: "draft", url: s.sourceUrl, canonicalUrl: canonicalUrl(s.sourceUrl), title: s.sourceTitle ?? s.title, excerpt: s.summary, publishedAt: `${s.eventDate}T00:00:00.000Z`, sourceName: s.sourceName };
  const dup = dedupeItem(item, existing);
  if (dup.result === "DUPLICATE") fail.push(`기존 기사와 중복: ${dup.matchSlug} (${dup.reason})`);
  if ((dup.result === "UNCERTAIN" || dup.result === "UPDATE_EXISTING") && dup.matchSlug !== d.relatedStory?.slug) fail.push(`기존 기사 ${dup.matchSlug}와 관련 — relatedStory로 관계를 밝혀야 함`);
  for (const x of s.secondarySources ?? [])
    if (existing.stories.some((st) => aliasUrl(canonicalUrl(st.sourceUrl)) === aliasUrl(canonicalUrl(x.sourceUrl)))) fail.push(`추가 출처가 기존 기사 원문과 같음: ${x.sourceUrl}`);
  return { slug: s.slug, verdict: fail.length ? "FAIL" : review.length ? "REVIEW" : "PASS", quality: q.status, duplicate: dup.result, matchSlug: dup.matchSlug ?? null, fail, review };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const onlyI = argv.indexOf("--only");
  const file = argv.find((a, i) => !a.startsWith("--") && (onlyI < 0 || i !== onlyI + 1));
  if (!file || !fs.existsSync(file)) {
    console.error("사용법: npm run daily:check-drafts -- <editorial-drafts.json> [--only slug,slug]");
    process.exit(1);
  }
  // --only: 발행할 원고만 점검한다 (publish.yml의 only와 같은 값). 지정하지 않으면 전부 점검 — 기존 방식 그대로
  const only = onlyI >= 0 ? String(argv[onlyI + 1] ?? "").split(",").map((x) => x.trim()).filter(Boolean) : [];
  if (onlyI >= 0 && !only.length) {
    console.error("--only 값이 비어 있음");
    process.exit(1);
  }
  const doc = JSON.parse(fs.readFileSync(file, "utf8"));
  const existing = loadExisting();
  let bad = 0;
  if (only.length) {
    if (new Set(only).size !== only.length) {
      console.log("FAIL   only에 같은 slug가 두 번 있음");
      bad++;
    }
    for (const x of new Set(only))
      if (!doc.drafts.some((d) => d.story.slug === x)) {
        console.log(`FAIL   only에 지정한 원고 없음: ${x}`);
        bad++;
      }
    doc.drafts = doc.drafts.filter((d) => only.includes(d.story.slug));
    console.log(`only 지정 — 원고 ${doc.drafts.length}건만 점검`);
  }
  const slugs = doc.drafts.map((d) => d.story.slug);
  if (new Set(slugs).size !== slugs.length) {
    console.log("FAIL 원고끼리 slug 중복");
    bad++;
  }
  for (const d of doc.drafts) {
    const r = checkDraft(d, existing);
    if (r.verdict === "FAIL") bad++;
    console.log(`${r.verdict.padEnd(6)} ${r.slug} · 품질 ${r.quality} · 중복 판정 ${r.duplicate}${r.matchSlug ? ` (${r.matchSlug})` : ""}`);
    for (const x of [...r.fail, ...r.review]) console.log(`   - ${x}`);
  }
  console.log(bad ? `실패 — 원고 ${bad}건 수정 필요` : `OK — 원고 ${doc.drafts.length}건 점검 통과`);
  if (bad) process.exitCode = 1;
}
