/**
 * AI마중 DAILY 자동 편집 파이프라인 (Phase 7.1) — 공통 로직
 *
 * 수집 → 중복 판정 → 편집 점수·판정 → 근거 수집 → 원고 생성 → 검증 → 승인 대기열 → 보고서
 * 자동으로 content/에 발행하지 않는다. 승인(daily:approve)은 사람이 명시적으로 실행한다.
 *
 * 원칙: AI, 해본 만큼만 말합니다.
 *  - 수집한 공식 자료(피드 설명·원문 본문 일부)만 근거로 쓴다. 근거가 부족하면 HOLD.
 *  - 원문 HTML 전문을 저장하지 않는다. 근거 문장(짧은 발췌)만 승인 검토용으로 남긴다.
 *  - 실패한 수집을 성공처럼 처리하지 않는다 (source 상태를 그대로 보고).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { collectors } from "../ingest/collectors.mjs";
import {
  CATEGORIES,
  ROOT,
  bodyText,
  canonicalUrl,
  candidateId,
  isAiRelevant,
  isoDate,
  loadAllCandidates,
  politeFetch,
  readJson,
  robotsAllowed,
  selectionScore,
  stripHtml,
} from "../ingest/lib.mjs";

// ---------- 설정 · 비용 상한 ----------

/** 기본값은 보수적으로. 환경변수로 낮출 수는 있지만 HARD_CAPS를 넘길 수는 없다 */
export const DEFAULTS = {
  windowDays: 2, // 기준일 포함 최근 N+1일 발표만 본다 (피드 지연 대비)
  maxItemsPerSource: 20,
  maxCandidatesPerDay: 6, // 근거 수집·원고 생성까지 가는 후보 수
  maxEvidenceFetches: 8,
  maxLlmCalls: 6,
  maxOutputTokens: 2500,
  llmTimeoutMs: 60_000,
  llmRetries: 1, // 실패 시 다시 시도 횟수 (총 시도 = 1 + retries)
};
export const HARD_CAPS = { maxCandidatesPerDay: 12, maxLlmCalls: 12, maxOutputTokens: 4000, llmRetries: 2, maxEvidenceFetches: 15, maxItemsPerSource: 40 };

export function loadLimits(env = process.env) {
  const pick = (key, envName) => {
    const v = Number(env[envName]);
    const base = Number.isFinite(v) && v >= 0 ? v : DEFAULTS[key];
    return HARD_CAPS[key] !== undefined ? Math.min(base, HARD_CAPS[key]) : base;
  };
  return {
    ...DEFAULTS,
    maxCandidatesPerDay: pick("maxCandidatesPerDay", "DAILY_MAX_CANDIDATES"),
    maxLlmCalls: pick("maxLlmCalls", "DAILY_MAX_LLM_CALLS"),
    maxOutputTokens: pick("maxOutputTokens", "DAILY_MAX_OUTPUT_TOKENS"),
    llmRetries: pick("llmRetries", "DAILY_LLM_RETRIES"),
    maxEvidenceFetches: pick("maxEvidenceFetches", "DAILY_MAX_EVIDENCE_FETCHES"),
    maxItemsPerSource: pick("maxItemsPerSource", "DAILY_MAX_ITEMS_PER_SOURCE"),
  };
}

/** 킬 스위치: DAILY_AUTOMATION_ENABLED가 정확히 "true"일 때만 돈다 (없거나 다른 값이면 멈춤) */
export const automationEnabled = (env = process.env) => String(env.DAILY_AUTOMATION_ENABLED ?? "").trim().toLowerCase() === "true";

export const DAILY_DIR = path.join(ROOT, "ingest", "daily");
export const PROCESSED_FILE = process.env.DAILY_PROCESSED_FILE || path.join(ROOT, "ingest", "log", "daily-processed.json");

export const isDateStr = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
/** 한국 시간 기준 오늘 */
export const kstToday = (now = Date.now()) => new Date(now + 9 * 3600_000).toISOString().slice(0, 10);
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);

// ---------- 기존 데이터 ----------

export function loadExisting(root = ROOT) {
  const stories = [];
  const storyDir = path.join(root, "content", "stories");
  for (const f of fs.existsSync(storyDir) ? fs.readdirSync(storyDir).filter((x) => x.endsWith(".json")) : []) stories.push(...readJson(path.join(storyDir, f), []));
  const editorialIds = new Set();
  const editorialSlugs = new Set();
  const edDir = path.join(root, "ingest", "editorial");
  for (const f of fs.existsSync(edDir) ? fs.readdirSync(edDir).filter((x) => x.endsWith(".json")) : [])
    for (const d of readJson(path.join(edDir, f), [])) {
      editorialIds.add(d.c);
      for (const x of d.secondary ?? []) editorialIds.add(x);
      editorialSlugs.add(d.slug);
    }
  const topics = readJson(path.join(root, "content", "topics.json"), []).map((t) => t.slug);
  return { stories, candidates: loadAllCandidates(), editorialIds, editorialSlugs, topics };
}

// ---------- 1) 수집 ----------

const BLOCK_RE = /robots\.txt disallow|HTTP 40[13]|HTTP 429/;

/**
 * 활성 소스를 돌며 기준일 창(date-windowDays ~ date) 안의 발표를 모은다.
 * ingest/candidates·state.json은 건드리지 않는다 (승인할 때만 후보로 들어간다).
 * @returns {{ items: object[], sources: object[] }}
 */
export async function collectDaily({ date, registry, limits, known }) {
  const since = addDays(date, -limits.windowDays);
  const fetchedAt = new Date().toISOString();
  const items = [];
  const sources = [];
  const seen = new Set();
  for (const src of registry.sources) {
    if (!src.enabled || !collectors[src.fetchMode]) {
      sources.push({ id: src.id, name: src.name, status: "skipped", reason: src.enabled ? `수집 방식 없음 (${src.fetchMode})` : "비활성" });
      continue;
    }
    const stats = { id: src.id, since, requests: 0, found: 0, inRange: 0, irrelevant: 0, new: 0, duplicate: 0, skippedKnown: 0, errors: [] };
    let got = [];
    try {
      got = await collectors[src.fetchMode](src, since, stats, { maxPaged: 3, maxMeta: limits.maxItemsPerSource, known });
    } catch (e) {
      stats.errors.push(String(e.message ?? e));
    }
    const inWindow = [];
    for (const it of got) {
      const publishedAt = isoDate(it.date);
      if (!publishedAt || publishedAt.slice(0, 10) < since || publishedAt.slice(0, 10) > date) continue;
      if (src.relevance === "ai" && !isAiRelevant(it)) continue;
      const fp = candidateId(it.idKey ?? it.url);
      if (seen.has(fp)) continue;
      seen.add(fp);
      inWindow.push({
        id: fp,
        url: it.url,
        canonicalUrl: canonicalUrl(it.url),
        title: stripHtml(it.title ?? "").slice(0, 300),
        // 공식 피드·메타가 제공한 짧은 설명만 (전문 아님)
        excerpt: stripHtml(it.description ?? "").slice(0, 300),
        publishedAt,
        ...(it.datePrecision ? { datePrecision: it.datePrecision } : {}),
        sourceId: src.id,
        sourceName: src.name,
        sourceType: src.sourceType,
        tier: src.tier,
        fetchMode: src.fetchMode,
        discoveredVia: it.discoveredVia,
        fetchedAt,
      });
    }
    inWindow.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
    const kept = inWindow.slice(0, limits.maxItemsPerSource);
    items.push(...kept);
    const errs = stats.errors;
    const status = !errs.length ? "success" : got.length ? "partial" : errs.every((e) => BLOCK_RE.test(e)) ? "blocked" : "failed";
    sources.push({ id: src.id, name: src.name, status, requests: stats.requests, found: got.length, inWindow: inWindow.length, kept: kept.length, ...(errs.length ? { errors: errs.slice(0, 3).map((e) => e.slice(0, 200)) } : {}) });
  }
  return { items, sources, since };
}

// ---------- 2) 중복 판정 ----------

const STOP = new Set(["the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with", "at", "by", "from", "is", "are", "our", "your", "new", "now", "how", "we", "its", "it", "as", "into", "about", "this", "that"]);
export function normalizeTitle(t) {
  return String(t ?? "")
    .toLowerCase()
    .replace(/\s+[|–—-]\s+[^|–—-]{2,40}$/, "") // " | OpenAI" 같은 꼬리
    .replace(/[^\p{L}\p{N}\s.-]/gu, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^[.-]+|[.-]+$/g, ""))
    .filter((w) => w.length > 1 && !STOP.has(w));
}
export function titleSimilarity(a, b) {
  const A = new Set(normalizeTitle(a));
  const B = new Set(normalizeTitle(b));
  if (!A.size || !B.size) return 0;
  const inter = [...A].filter((w) => B.has(w)).length;
  return inter / (A.size + B.size - inter);
}
const UPDATE_RE = /\b(now (generally )?available|generally available|\bGA\b|expand(s|ed|ing)?|rolling out|rolls out|update[sd]?|coming to|arrives? (in|on)|launch(es|ed)? in|now in|adds?|extends?)\b/i;
/**
 * 버전이 붙은 구체적 제품만: 'GPT-5.5', 'Claude Sonnet 5', 'Gemini 3.5'.
 * 'Amazon Bedrock'·'Claude Code'·'Google Docs' 같은 플랫폼 이름은 그 위의 글마다 걸려 같은 사안 판정에 쓰지 않는다
 * (2026-10-07 dry-run에서 오탐 8건 확인)
 */
const specificProducts = (s) => (s.products ?? []).filter((p) => p.length >= 4 && /\d/.test(p));
const daysBetween = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) / 86400_000;

/**
 * NEW · UPDATE_EXISTING · DUPLICATE · UNCERTAIN
 * UNCERTAIN은 자동 발행 대상이 아니다 (사람이 판단).
 */
export function dedupeItem(item, existing) {
  const url = item.canonicalUrl;
  for (const s of existing.stories) {
    if (canonicalUrl(s.sourceUrl) === url) return { result: "DUPLICATE", reason: "같은 원문으로 쓴 기사가 있음", matchSlug: s.slug };
    if ((s.secondarySources ?? []).some((x) => canonicalUrl(x.sourceUrl) === url)) return { result: "DUPLICATE", reason: "기존 기사의 추가 출처", matchSlug: s.slug };
  }
  if (existing.editorialIds.has(item.id)) return { result: "DUPLICATE", reason: "편집 원고에 이미 쓰인 후보" };
  const near = existing.stories.filter((s) => s.eventDate && item.publishedAt && daysBetween(s.eventDate, item.publishedAt) <= 45);
  let best = null;
  for (const s of near) {
    const sim = titleSimilarity(item.title, s.sourceTitle);
    if (!best || sim > best.sim) best = { sim, slug: s.slug };
  }
  if (best && best.sim >= 0.75) return { result: "DUPLICATE", reason: `원문 제목이 기존 기사와 거의 같음 (${best.sim.toFixed(2)})`, matchSlug: best.slug };
  const text = `${item.title} ${item.excerpt}`;
  for (const s of existing.stories.filter((x) => x.eventDate && daysBetween(x.eventDate, item.publishedAt) <= 120)) {
    const hit = specificProducts(s).find((p) => text.toLowerCase().includes(p.toLowerCase()));
    if (!hit) continue;
    if (UPDATE_RE.test(text) && s.sourceName === item.sourceName) return { result: "UPDATE_EXISTING", reason: `기존 기사(${hit})의 후속 발표로 보임`, matchSlug: s.slug };
    return { result: "UNCERTAIN", reason: `기존 기사와 같은 제품(${hit}) — 같은 사안인지 사람이 판단`, matchSlug: s.slug };
  }
  if (best && best.sim >= 0.45) return { result: "UNCERTAIN", reason: `원문 제목이 기존 기사와 비슷함 (${best.sim.toFixed(2)})`, matchSlug: best.slug };
  if (existing.candidates.has(item.id)) return { result: "NEW", reason: "후보 기록에는 있으나 기사로 쓰이지 않음" };
  return { result: "NEW", reason: "기존 기사·후보와 겹치지 않음" };
}

// ---------- 3) 편집 점수 · 판정 ----------

const KOREA_RE = /\b(korea|korean|seoul|samsung|naver|kakao|lg|sk hynix|sk telecom)\b/i;
const GLOBAL_RE = /\b(global(ly)?|worldwide|all (users|countries|regions)|every(one|where)|all plans)\b/i;
const REGION_ONLY_RE = /\b(in the (us|u\.s\.|united states|uk|eu)|u\.s\.(-| )only|us-only|eu only|united states only)\b/i;
const IMPACT_RE = [
  [/\b(introduc|launch|now available|generally available|rolling out|rolls out|available (in|to|for|on)|released?)/i, 2],
  [/\b(price|pricing|free|plan|tier|credits?|subscription)\b/i, 1],
  [/\b(deprecat|retir|sunset|end of support|no longer|breaking change)/i, 1],
];
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

export function scoreItem(item, dup) {
  const raw = selectionScore({ title: item.title, description: item.excerpt });
  const text = `${item.title} ${item.excerpt}`;
  const score = {
    importance: clamp(Math.round(raw / 2) + (item.tier === 1 ? 1 : 0), 0, 5),
    koreanRelevance: clamp((KOREA_RE.test(text) ? 2 : 0) + (GLOBAL_RE.test(text) ? 1 : 0) - (REGION_ONLY_RE.test(text) ? 1 : 0), 0, 3),
    practicalImpact: clamp(IMPACT_RE.reduce((n, [re, w]) => n + (re.test(text) ? w : 0), 0), 0, 3),
    sourceQuality: item.sourceType === "official" ? (item.tier === 1 ? 3 : 2) : 1,
    novelty: { NEW: 3, UPDATE_EXISTING: 2, UNCERTAIN: 0, DUPLICATE: 0 }[dup.result],
    verificationConfidence: clamp((item.datePrecision === "month" ? 0 : 1) + ((item.excerpt ?? "").length >= 120 ? 1 : 0), 0, 3),
    selectionRaw: raw,
  };
  score.total = score.importance + score.koreanRelevance + score.practicalImpact + score.sourceQuality + score.novelty + score.verificationConfidence;
  return score;
}

/** 판정 (근거 수집 전): PUBLISH(근거 확인 대상) · HOLD · EXCLUDE */
export function decide(item, dup, score) {
  if (dup.result === "DUPLICATE") return { decision: "EXCLUDE", reasons: [`중복: ${dup.reason}`] };
  if (dup.result === "UNCERTAIN") return { decision: "HOLD", reasons: [`중복 불확실: ${dup.reason}`], needsReview: ["duplicate_uncertain"] };
  if (item.datePrecision === "month") return { decision: "HOLD", reasons: ["발표일(일자)을 알 수 없음 — 날짜를 지어내지 않는다"], needsReview: ["date_conflict"] };
  if (score.selectionRaw <= 0) return { decision: "EXCLUDE", reasons: ["독자 가치 신호 없음 (사례·가이드·행사·인사 등)"] };
  if (score.importance >= 2 && score.total >= 10) return { decision: "PUBLISH", reasons: ["중요도·실용성·출처 기준 통과 (근거 확인 필요)"] };
  if (score.importance >= 1) return { decision: "HOLD", reasons: ["가치는 있으나 기준 점수 미달 — 편집자 판단"] };
  return { decision: "EXCLUDE", reasons: ["중요도 낮음"] };
}

// ---------- 4) 근거 수집 (Evidence Ledger) ----------

const SENT_SPLIT = /(?<=[.!?])\s+(?=[A-Z0-9"“(])/;
/** 원문 본문에서 근거 문장만 고른다 (숫자·제품명·제목 단어가 있는 문장 우선, 최대 n개 × 280자) */
export function pickEvidenceSentences(text, title, n = 12) {
  const words = new Set(normalizeTitle(title));
  const sentences = [];
  for (const line of text.split("\n")) for (const s of line.split(SENT_SPLIT)) {
    const t = s.replace(/^•\s*/, "").trim();
    if (t.length >= 40 && t.length <= 600) sentences.push(t);
  }
  const ranked = sentences
    .map((s, i) => ({ s, i, w: (/\d/.test(s) ? 2 : 0) + normalizeTitle(s).filter((w) => words.has(w)).length + (/\b(available|launch|price|preview|beta|general availability|rolling|countries|regions|users|plan)\b/i.test(s) ? 1 : 0) }))
    .sort((a, b) => b.w - a.w || a.i - b.i)
    .slice(0, n)
    .sort((a, b) => a.i - b.i);
  return ranked.map((x) => (x.s.length > 280 ? `${x.s.slice(0, 277)}…` : x.s));
}

/** 근거 판정 (source-gate 기준과 같은 글자 수 기준) */
export function evidenceGrade(officialChars, best) {
  if (officialChars >= 2500 && best >= 1200) return "PASS";
  if (officialChars >= 600) return "LIMITED";
  return "FAIL";
}

/**
 * 후보의 공식 원문을 읽어 근거 장부를 만든다. robots·403·429·시간 초과는 우회하지 않는다.
 * 본문 전문은 저장하지 않고 고른 문장만 남긴다.
 */
export async function gatherEvidence(item, { hostFails }) {
  const checkedAt = new Date().toISOString();
  const ledger = [];
  if (item.excerpt) ledger.push({ id: "E0", kind: "feed", text: item.excerpt, sourceUrl: item.url, source: item.sourceName, publishedAt: item.publishedAt, checkedAt });
  const host = new URL(item.url).host;
  const out = { status: "", chars: 0, grade: "FAIL", ledger, pageDate: null };
  if ((hostFails.get(host) ?? 0) >= 2) out.status = "SKIPPED_HOST_BLOCKED";
  else if (!(await robotsAllowed(item.url))) out.status = "ROBOTS_BLOCKED";
  else {
    try {
      const r = await politeFetch(item.url.split("#")[0], { delay: 1200, accept: "text/html" });
      if (!r.ok) {
        out.status = `HTTP_${r.status}`;
        await r.body?.cancel();
        if (r.status === 403 || r.status === 429) hostFails.set(host, (hostFails.get(host) ?? 0) + 1);
      } else {
        const html = await r.text();
        const m = html.match(/<meta[^>]+(?:property|name)=["']article:published_time["'][^>]+content=["']([^"']+)["']/i);
        out.pageDate = m ? isoDate(m[1]) : null;
        const text = bodyText(html);
        out.chars = text.replace(/\s/g, "").length;
        out.status = "OK";
        pickEvidenceSentences(text, item.title).forEach((t, i) => ledger.push({ id: `E${i + 1}`, kind: "body", text: t, sourceUrl: item.url, source: item.sourceName, publishedAt: item.publishedAt, checkedAt }));
      }
    } catch (e) {
      out.status = e?.name === "TimeoutError" ? "TIMEOUT" : "NETWORK";
      hostFails.set(host, (hostFails.get(host) ?? 0) + 1);
    }
  }
  out.grade = item.sourceType === "official" ? evidenceGrade(out.chars, out.chars) : "FAIL";
  return out;
}

/**
 * 근거로 쓸 수 있는 깊이 (DEFAULT STANDARD 없음).
 *  DEEP 제안: 근거 PASS + 중요도 4 이상 — 7.1에서는 자동 원고로 승인하지 않는다 (사람이 deep 원고 작성)
 *  STANDARD: 근거 LIMITED 이상 + 본문 근거 문장 5개 이상 (변화·조건·영향을 설명할 재료)
 *  SHORT: 그 밖에 근거 문장 2개 이상
 *  null: 근거 부족 → HOLD
 */
export function suggestDepth(evidence, score) {
  const bodySentences = evidence.ledger.filter((e) => e.kind === "body").length;
  if (evidence.grade === "PASS" && score.importance >= 4 && bodySentences >= 8) return "DEEP";
  if ((evidence.grade === "PASS" || evidence.grade === "LIMITED") && bodySentences >= 5) return "STANDARD";
  if (evidence.ledger.length >= 3 || (evidence.ledger.length >= 2 && bodySentences >= 1)) return "SHORT";
  return null;
}

// ---------- 5) 원고 검증 ----------

const RELATIVE_RE = /(오늘|어제|내일|그저께|이번 주|지난주|다음 주|이번 달|지난달|최근|곧|조만간|\btoday\b|\byesterday\b|\btomorrow\b|\bthis week\b|\blast week\b|\brecently\b|\bsoon\b)/i;
const SUPERLATIVE_RE = /(최고|최초|가장|획기적|압도적|혁신적|업계 최고|세계 최초|state-of-the-art|best-in-class|world'?s first)/i;
const ATTRIB_RE = /(밝혔|설명했|주장했|에 따르면|발표했|소개했|강조했|라고 했|이라고 했|말했|자체 평가|자체 실험)/;
const GA_RE = /(정식 (출시|제공|버전)|일반 제공|GA\b|전면 (출시|제공)|정식으로)/;
const PREVIEW_RE = /\b(preview|beta|early access|limited|waitlist|experimental|research preview|pilot)\b/i;
const PRICE_RE = /(\$\s?\d|\d[\d,.]*\s?(달러|원|유로|엔|USD|KRW|EUR)\b)/;
const NUM_RE = /\d+(?:[.,]\d+)*/g;
// 제품·모델 이름: 'GPT-5.5', 'Widget 3X', 'Gemini 3.5 Pro', 'ReviewBench' (숫자가 붙은 이름·낙타 표기)
const LATIN_NAME_RE = /\b[A-Z][A-Za-z]*(?:[ -][A-Za-z]*\d[A-Za-z0-9.]*)+|\b[A-Za-z][A-Za-z0-9.+-]*\d[A-Za-z0-9.+-]*\b|\b[A-Z][a-z]+[A-Z][A-Za-z]+\b/g;

const normNum = (n) => n.replace(/,/g, "").replace(/\.0+$/, "").replace(/^0+(?=\d)/, "");
const draftTexts = (d) => [d.title, d.summary, ...(d.facts ?? []).map((f) => f.text), d.why?.text, d.change?.text].filter(Boolean);

/**
 * 생성 원고를 근거와 대조한다.
 * errors: 승인 불가 (형식 오류·근거 없는 문장)
 * needsReview: 사람이 확인해야 할 신호 (승인 시 --ack로 확인 표시)
 */
export function validateDraft(draft, { item, evidence, existing, dup }) {
  const errors = [];
  const flags = new Set();
  const ids = new Set(evidence.ledger.map((e) => e.id));
  const evText = evidence.ledger.map((e) => e.text).join("\n");
  const evNums = new Set((evText.match(NUM_RE) ?? []).map(normNum));
  const evLower = evText.toLowerCase();

  for (const k of ["title", "summary", "category"]) if (!draft[k]) errors.push(`${k} 없음`);
  if (!Array.isArray(draft.facts) || draft.facts.length < 1 || draft.facts.length > 5) errors.push("facts는 1~5개");
  if (!draft.why?.text || !draft.change?.text) errors.push("why·change 필요");
  if (draft.category && !CATEGORIES.includes(draft.category)) errors.push(`category ${draft.category} 없음`);
  for (const t of draft.topics ?? []) if (!existing.topics.includes(t)) errors.push(`topic ${t} 없음`);
  if (!["SHORT", "STANDARD"].includes(draft.editorialDepth)) errors.push(`자동 원고 깊이는 SHORT·STANDARD만 (${draft.editorialDepth})`);
  if (draft.insufficient) flags.add("insufficient_evidence");

  // 문장마다 근거 id
  for (const [i, f] of (draft.facts ?? []).entries()) {
    const ev = f.evidence ?? [];
    if (!ev.length || ev.some((x) => !ids.has(x))) errors.push(`facts[${i}] 근거(evidence id) 없음·잘못됨`);
  }
  for (const k of ["why", "change"]) if (draft[k] && !(draft[k].evidence ?? []).every((x) => ids.has(x))) errors.push(`${k} 근거 id 잘못됨`);

  const all = draftTexts(draft).join("\n");
  for (const n of all.match(NUM_RE) ?? []) if (!evNums.has(normNum(n))) {
    flags.add("numeric_claim");
    break;
  }
  if (PRICE_RE.test(all) && !PRICE_RE.test(evText)) flags.add("price_unsupported");
  for (const name of new Set(all.match(LATIN_NAME_RE) ?? [])) if (!evLower.includes(name.toLowerCase())) {
    flags.add("unsupported_name");
    break;
  }
  if (GA_RE.test(all) && PREVIEW_RE.test(evText)) flags.add("rollout_uncertain");
  if (/한국/.test(all) && /(출시|제공|사용할 수|이용할 수)/.test(all) && !KOREA_RE.test(evText) && !/한국.{0,20}(아니|않|없|미정|제시되지)/.test(all)) flags.add("korea_claim_unsupported");
  for (const sentence of all.split(/(?<=[.!?다])\s+/)) if (SUPERLATIVE_RE.test(sentence) && !ATTRIB_RE.test(sentence)) {
    flags.add("company_claim_unattributed");
    break;
  }
  if (RELATIVE_RE.test(all)) flags.add("relative_date");
  const sents = all.split(/(?<=[.!?다])\s+/).map((s) => s.trim()).filter((s) => s.length > 15);
  if (new Set(sents).size !== sents.length) flags.add("duplicate_sentence");
  if (!item.publishedAt) errors.push("발표일 없음");
  if (evidence.status !== "OK") flags.add("source_blocked");
  if (evidence.pageDate && item.publishedAt && daysBetween(evidence.pageDate, item.publishedAt) > 1.5) flags.add("date_conflict");
  if (dup.result === "UNCERTAIN") flags.add("duplicate_uncertain");
  for (const s of existing.stories) if (titleSimilarity(draft.title, s.title) >= 0.6) {
    flags.add("duplicate_uncertain");
    break;
  }
  return { errors, needsReview: [...flags] };
}

// ---------- 6) 슬러그 ----------

export function proposeSlug(title, taken) {
  const base =
    String(title)
      .toLowerCase()
      .replace(/\s+[|–—-]\s+[^|–—-]{2,40}$/, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .split("-")
      .filter((w) => w && !STOP.has(w))
      .slice(0, 7)
      .join("-") || "daily-story";
  let slug = base.slice(0, 60).replace(/-+$/, "");
  for (let i = 2; taken.has(slug); i++) slug = `${base.slice(0, 56)}-${i}`;
  return slug;
}

// ---------- 처리 기록 (같은 URL 재처리 방지) ----------

export function loadProcessed(file = PROCESSED_FILE) {
  return readJson(file, {});
}
export function saveProcessed(map, file = PROCESSED_FILE) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(map, null, 2) + "\n");
}

export const sha = (s) => crypto.createHash("sha256").update(s).digest("hex").slice(0, 12);
