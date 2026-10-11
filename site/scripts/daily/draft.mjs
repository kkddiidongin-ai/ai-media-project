/**
 * AI마중 DAILY — AI 초안 (Phase 7.1.3)
 *
 *   draftEligibility(row)        초안을 만들어도 되는 후보인지 (LLM을 부르기 '전'에 거른다)
 *   reviewDraft(draft, ctx)      초안 자동 QA: FACT · EVIDENCE · EDITORIAL · STRUCTURE · DUPLICATE · SAFETY → PASS · REVIEW · FAIL
 *   renderDraftMarkdown(record)  사람이 읽는 초안 (PR·artifact)
 *   buildDraftRecord(...)        drafts/<id>.json 기록
 *
 * 원칙: AI, 해본 만큼만 말합니다.
 *  - 자동 QA PASS는 발행 승인이 아니다. 모든 초안은 사람이 확인한다.
 *  - FAIL 초안은 승인 대기에서 빠진다 (원고는 오류 확인용으로만 남긴다).
 *  - 근거 장부(evidence ledger)에 없는 숫자·가격·날짜·이름·버전·지역·출시 단계·API 제공은 FAIL.
 *  - AI마중이 직접 써 본 것처럼 쓰면 FAIL ('직접 써봄'·'직접 재봄' 표시는 실제 시험한 기사에만).
 * 이 파일은 content/·ingest/ 발행 데이터에 쓰지 않는다.
 */
import { mentionsProduct, titleSimilarity, validateDraft } from "./lib.mjs";

// ---------- 1) 초안 생성 대상 ----------

/**
 * 모두 충족해야 LLM을 부른다: 최종 PUBLISH · 중복 NEW 또는 확인된 UPDATE_EXISTING · 원문 근거 OK ·
 * 확인 사실 2개 이상 · 원문 주소·발표일(일자) 확인 · 공식 출처 · DEEP 아님(사람 승인 없이 자동 작성 금지)
 */
export function draftEligibility(r) {
  const reasons = [];
  if (r.decision !== "PUBLISH") reasons.push(`판정 ${r.decision} — PUBLISH만 초안 생성`);
  const dup = r.dup?.result;
  if (!(dup === "NEW" || (dup === "UPDATE_EXISTING" && r.dup.matchSlug))) reasons.push(`중복 판정 ${dup} — NEW 또는 확인된 UPDATE_EXISTING만`);
  if (r.evidence?.status !== "OK") reasons.push(`원문 근거 ${r.evidence?.status ?? "없음"} — 원문을 읽은 후보만 (대체 근거만으로는 자동 초안 없음)`);
  const body = (r.evidence?.ledger ?? []).filter((e) => e.kind === "body").length;
  if (body < 1 || (r.facts ?? 0) < 2) reasons.push(`핵심 사실 부족 (원문 근거 ${body}문장 · 확인 사실 ${r.facts ?? 0}개)`);
  if (r.depth === "DEEP") reasons.push("DEEP 후보 — 사람의 별도 승인 없이 자동 작성하지 않음 (편집자가 직접 작성)");
  else if (!["SHORT", "STANDARD"].includes(r.depth)) reasons.push("근거로 정한 기사 유형 없음 (근거 부족)");
  const item = r.item ?? {};
  if (!/^https:\/\/[^\s]+$/.test(item.url ?? "")) reasons.push("원문 주소 확인 안 됨");
  if (!item.publishedAt || Number.isNaN(Date.parse(item.publishedAt)) || item.datePrecision === "month") reasons.push("발표일(일자) 확인 안 됨");
  if (item.sourceType && item.sourceType !== "official") reasons.push(`출처 유형 ${item.sourceType} — 공식 발표만`);
  return { ok: !reasons.length, reasons };
}

// ---------- 2) 근거 대조 도구 ----------

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const MONTH_RE = "(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\\.?";
const WORD_NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, twice: 2, double: 2, triple: 3, half: 50 };
const NUM_RE = /\d+(?:[.,]\d+)*/g;
const normNum = (n) => n.replace(/,/g, "").replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "").replace(/^0+(?=\d)/, "");
/** 문장 속 근거 표시([E1]·A2)는 숫자로 세지 않는다 */
const stripRefs = (t) => String(t ?? "").replace(/\[?\b[EA]\d{1,2}\b\]?/g, " ");
const numbersIn = (t) => (stripRefs(t).match(NUM_RE) ?? []).map(normNum);

/** 근거 장부에서 날짜(월-일 · 연-월)와 숫자 집합 */
function ledgerFacts(texts, extraDates = []) {
  const all = texts.join("\n");
  const nums = new Set(numbersIn(all));
  for (const w of all.toLowerCase().match(/\b[a-z]+\b/g) ?? []) if (WORD_NUM[w] !== undefined) nums.add(String(WORD_NUM[w]));
  const md = new Set();
  const ym = new Set();
  const add = (y, m, d) => {
    nums.add(String(m));
    if (d) md.add(`${m}-${d}`);
    if (y) ym.add(`${y}-${m}`);
    if (y) nums.add(String(y));
  };
  for (const m of all.matchAll(new RegExp(`\\b${MONTH_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(\\d{4}))?`, "gi"))) add(m[3] && Number(m[3]), MONTHS[m[1].slice(0, 3).toLowerCase()], Number(m[2]));
  for (const m of all.matchAll(new RegExp(`\\b(\\d{1,2})\\s+${MONTH_RE}(?:,?\\s+(\\d{4}))?`, "gi"))) add(m[3] && Number(m[3]), MONTHS[m[2].slice(0, 3).toLowerCase()], Number(m[1]));
  for (const m of all.matchAll(new RegExp(`\\b${MONTH_RE}\\s+(\\d{4})\\b`, "gi"))) add(Number(m[2]), MONTHS[m[1].slice(0, 3).toLowerCase()], null);
  for (const m of [...all.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g), ...extraDates.map((d) => String(d).match(/^(\d{4})-(\d{2})-(\d{2})/)).filter(Boolean)]) add(Number(m[1]), Number(m[2]), Number(m[3]));
  return { nums, md, ym };
}

const CURRENCY = [
  ["USD", /(\$|US\$|달러|USD)/, /(\$|\bUSD\b|dollars?)/i],
  ["KRW", /(₩|원|KRW)/, /(₩|\bKRW\b|\bwon\b)/i],
  ["EUR", /(€|유로|EUR)/, /(€|\bEUR\b|euros?)/i],
  ["JPY", /(¥|엔|JPY)/, /(¥|\bJPY\b|\byen\b)/i],
];
// 숫자 바로 뒤의 통화 단위만 ('20,000원부터'의 조사 포함). 판정은 이 일치 문자열 안에서만 한다
const PRICE_RE = /(US\$|\$|₩|€|¥)\s?\d[\d,.]*|\d[\d,.]*\s?(달러|원|유로|엔|USD|KRW|EUR|JPY)/g;

const REGIONS = [
  ["한국", /(한국|국내)/, /\b(korea|korean|seoul)\b/i],
  ["미국", /미국/, /\b(US|U\.S\.|United States|America)\b/],
  ["유럽", /(유럽|EU\b)/, /\b(europe|european|EU)\b/i],
  ["일본", /일본/, /\bjapan(ese)?\b/i],
  ["중국", /중국/, /\bchina|chinese\b/i],
  ["영국", /영국/, /\b(UK|United Kingdom|Britain|British)\b/],
  ["인도", /인도(?!네시아)/, /\bindia\b/i],
  ["전 세계", /(전 ?세계|글로벌|모든 국가)/, /\b(worldwide|global(ly)?|all countries|every country|around the world)\b/i],
];
/** '확인되지 않았다'처럼 부정·미확인을 말하는 문장은 지역·출시 주장으로 보지 않는다 */
const NEGATED = /(확인되지|밝히지 않|언급(하지 않|이 없)|나와 있지 않|없(다|습니다|음|으며|고)|미정|알 수 없|아직|여부)/;

const GA_KO = /(정식 (출시|제공|버전|공개)|일반 제공|\bGA\b|전면 (출시|제공)|정식으로)/;
const GA_EN = /\b(generally available|general availability|GA)\b/i;
const PREVIEW_KO = /(프리뷰|미리 ?보기|베타|시험 제공|얼리 ?액세스|제한(적)? 제공|연구 프리뷰|대기자 명단)/;
const PREVIEW_EN = /\b(preview|beta|early access|limited|waitlist|experimental|research preview|pilot)\b/i;
const FREE_KO = /무료/;
const FREE_EN = /\b(free|no cost|no charge|at no (extra )?cost|without charge)\b/i;

const FAKE_EXPERIENCE = /(직접 ?(써|사용해|테스트해|재|체험해|돌려|실행해) ?(봄|봤|보니|본 결과|본)|써 ?보니|사용해 ?보니|테스트해 ?보니|체험해 ?보니|돌려 ?보니|(우리|AI마중|필자|기자)(가|이|는)? ?(직접 )?(측정|테스트|실험|체험|사용)(했|해 ?보)|실측(해|한|결과))/;
const HYPE_TITLE = /(충격|경악|역대급|미쳤|대박|무조건|필수템|게임 ?체인저|혁명|판도를 (바꿀|뒤집)|놓치면|!)/;
const HYPE_BODY = /(충격|경악|역대급|미쳤|대박|무조건|게임 ?체인저|혁명적|판도를 (바꿀|뒤집)|놓치면 안|획기적|압도적|놀라운|완벽한|꿈의)/;
const SUPERLATIVE = /(최고|최초|가장|업계 최고|세계 최초|state-of-the-art|best-in-class)/i;
const ATTRIB = /(밝혔|설명했|주장했|에 따르면|발표했|소개했|강조했|라고 했|이라고 했|말했|자체 평가|자체 실험|자체 테스트)/;
const SPECULATION = /(것으로 보인다|것으로 예상|전망(이다|된다)|예상된다|기대된다|할 것이다|될 것이다|가능성이 (크|높))/;
const MARKET = /(시장 (규모|점유율|판도|주도권)|점유율|매출|패권|업계 판도|주가)/;
const RELATIVE = /(오늘|어제|내일|그저께|이번 주|지난주|다음 주|이번 달|지난달|최근|곧|조만간)/;
const TERM_WHITELIST = new Set(["API", "APIs", "SDK", "GPU", "CPU", "CEO", "CTO", "PDF", "URL", "LLM", "FAQ", "HTTP", "JSON", "AI마중", "MOCK"]);

const splitSentences = (t) => String(t ?? "").split(/(?<=[.!?다요])\s+/).map((s) => s.trim()).filter(Boolean);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ---------- 3) 초안 QA ----------

const DIMS = ["FACT", "EVIDENCE", "EDITORIAL", "STRUCTURE", "DUPLICATE", "SAFETY"];
export const LENGTH_RANGE = { SHORT: [150, 350], STANDARD: [400, 800] };
/** 본문 글자 수 (공백 포함): 핵심 요약 · 사실 · 해석 · 영향 · 확인 사항 */
export const bodyLength = (d) => [d.summary, ...(d.facts ?? []).map((f) => f.text), d.why?.text, d.change?.text, ...(d.checks ?? []).map((c) => c.text)].filter(Boolean).join(" ").length;

/**
 * @param {object} draft  LLM 원고 (providers.buildPrompt 형식)
 * @param {{ item, evidence, existing, dup, suggestedDepth }} ctx
 * @returns {{ verdict: "PASS"|"REVIEW"|"FAIL", checks: object, issues: object[], fixes: string[], needsReview: string[], errors: string[], stats: object }}
 */
export function reviewDraft(draft, { item, evidence, existing, dup, suggestedDepth }) {
  const issues = [];
  const add = (dim, severity, code, msg, where = "") => issues.push({ dim, severity, code, msg, ...(where ? { where } : {}) });
  const d = draft ?? {};
  const ledger = evidence?.ledger ?? [];
  const byId = new Map(ledger.map((e) => [e.id, e.text]));
  // 근거로 인정하는 글: 근거 장부 + 원문 제목·출처 이름(메타데이터로 확인된 것)
  const allowedTexts = [...ledger.map((e) => e.text), item?.title ?? "", item?.sourceName ?? ""];
  const allowed = allowedTexts.join("\n");
  const allowedLower = allowed.toLowerCase();
  const pub = item?.publishedAt ? [item.publishedAt.slice(0, 10)] : [];
  const L = ledgerFacts(allowedTexts, pub);

  // --- STRUCTURE · EVIDENCE: 기존 형식 검증 재사용 (근거 id · 분류 · 주제 · 깊이)
  const v = validateDraft(d, { item: item ?? {}, evidence: evidence ?? { ledger: [] }, existing, dup: dup ?? { result: "NEW" } });
  for (const e of v.errors) add(/근거|evidence/.test(e) ? "EVIDENCE" : "STRUCTURE", "FAIL", /근거|evidence/.test(e) ? "evidence_id" : "format", e);
  if (!d.title) add("STRUCTURE", "FAIL", "missing_title", "제목 없음");
  else if (d.title.length > 60) add("STRUCTURE", "REVIEW", "title_length", `제목 ${d.title.length}자 (60자 이내 권장)`, "title");
  if (!Array.isArray(d.checks) || !d.checks.length) add("STRUCTURE", "REVIEW", "missing_checks", "'독자가 확인할 사항'이 없음");
  if (!Array.isArray(d.unknowns)) add("STRUCTURE", "REVIEW", "missing_unknowns", "'아직 확인되지 않은 부분'이 없음");
  for (const [i, c] of (d.checks ?? []).entries()) if ((c.evidence ?? []).some((x) => !byId.has(x))) add("EVIDENCE", "FAIL", "evidence_id", `checks[${i}] 근거 id 잘못됨`);
  const depth = d.editorialDepth;
  if (depth === "DEEP") add("STRUCTURE", "FAIL", "deep_not_allowed", "DEEP은 자동 생성하지 않음");
  else if (depth === "STANDARD" && suggestedDepth === "SHORT") add("STRUCTURE", "FAIL", "depth_exceeds_evidence", "근거가 SHORT만 허락하는데 STANDARD로 씀");
  const len = bodyLength(d);
  const range = LENGTH_RANGE[depth];
  if (range && (len < range[0] * 0.7 || len > range[1] * 1.3)) add("STRUCTURE", "REVIEW", "length_out_of_range", `본문 ${len}자 — ${depth} 기준 약 ${range[0]}~${range[1]}자 (정보 밀도 확인)`);

  // --- EVIDENCE
  if (!item?.url || !item?.publishedAt) add("EVIDENCE", "FAIL", "source_unverified", "원문 주소·발표일 없음");
  if (evidence?.status !== "OK") add("EVIDENCE", "FAIL", "source_blocked", `원문 근거 ${evidence?.status ?? "없음"}`);
  if (d.insufficient) add("EVIDENCE", "FAIL", "insufficient_evidence", "LLM이 근거 부족이라고 답함");
  const cited = new Set([...(d.facts ?? []), ...(d.checks ?? []), d.why, d.change].flatMap((x) => x?.evidence ?? []));
  const bodyIds = new Set(ledger.filter((e) => e.kind === "body").map((e) => e.id));
  if (cited.size && ![...cited].some((x) => bodyIds.has(x))) add("EVIDENCE", "REVIEW", "weak_citation", "원문 본문 근거를 하나도 인용하지 않음 (피드 설명·대체 문서만)");

  // --- FACT: 문장 단위 대조
  const sections = [
    { where: "title", texts: [d.title], cite: null },
    { where: "summary", texts: [d.summary], cite: null },
    ...(d.facts ?? []).map((f, i) => ({ where: `facts[${i}]`, texts: [f.text], cite: f.evidence, fact: true })),
    ...(d.checks ?? []).map((c, i) => ({ where: `checks[${i}]`, texts: [c.text], cite: c.evidence })),
    { where: "why", texts: [d.why?.text], cite: null, interp: true },
    { where: "change", texts: [d.change?.text], cite: null, interp: true },
  ];
  const seen = new Set();
  const once = (code, key) => {
    const k = `${code}:${key}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  };
  for (const sec of sections) {
    for (const text of sec.texts.filter(Boolean)) {
      for (const sent of splitSentences(text)) {
        const negated = NEGATED.test(sent);
        // 숫자: 인용한 근거에 있어야 (없으면 다른 근거에라도 있으면 REVIEW, 어디에도 없으면 FAIL)
        const citedText = (sec.cite ?? []).map((x) => byId.get(x) ?? "").join("\n");
        const citedNums = sec.cite ? ledgerFacts([citedText], pub).nums : null;
        for (const n of numbersIn(sent)) {
          if (!L.nums.has(n)) {
            if (once("unsupported_number", n)) add("FACT", "FAIL", "unsupported_number", `근거에 없는 수치 '${n}'`, sec.where);
          } else if (citedNums && !citedNums.has(n) && once("citation_mismatch", `${sec.where}:${n}`)) add("EVIDENCE", "REVIEW", "citation_mismatch", `수치 '${n}'가 인용한 근거(${sec.cite.join(",")})에 없음 — 다른 근거 문장에 있음`, sec.where);
        }
        // 날짜: 월-일 조합이 근거·발표일에 있어야
        for (const m of sent.matchAll(/(?:(\d{4})년\s*)?(\d{1,2})월\s*(\d{1,2})일/g)) if (!L.md.has(`${Number(m[2])}-${Number(m[3])}`) && once("unsupported_date", m[0])) add("FACT", "FAIL", "unsupported_date", `근거에 없는 날짜 '${m[0]}'`, sec.where);
        for (const m of sent.matchAll(/(\d{4})년\s*(\d{1,2})월(?!\s*\d{1,2}일)/g)) if (!L.ym.has(`${Number(m[1])}-${Number(m[2])}`) && once("unsupported_date", m[0])) add("FACT", "FAIL", "unsupported_date", `근거에 없는 날짜 '${m[0]}'`, sec.where);
        // 가격·통화
        for (const m of sent.match(PRICE_RE) ?? []) {
          const cur = CURRENCY.find(([, ko]) => ko.test(m));
          if (cur && !cur[2].test(allowed) && once("price_currency", m)) add("FACT", "FAIL", "price_currency", `통화가 근거와 다름 '${m}' (근거에 ${cur[0]} 없음)`, sec.where);
        }
        if (FREE_KO.test(sent) && !negated && !FREE_EN.test(allowed) && !/무료/.test(allowed) && once("unsupported_pricing", "free")) add("FACT", "FAIL", "unsupported_pricing", "근거에 없는 '무료' 요금 표현", sec.where);
        // 지역
        for (const [name, ko, en] of REGIONS) if (ko.test(sent) && !negated && !en.test(allowed) && once("unsupported_region", name)) add("FACT", "FAIL", "unsupported_region", `근거에 없는 지역 '${name}'`, sec.where);
        // 출시 단계
        if (GA_KO.test(sent) && !negated && !GA_EN.test(allowed)) {
          if (PREVIEW_EN.test(allowed)) {
            if (once("rollout_mismatch", "ga")) add("FACT", "FAIL", "rollout_mismatch", "근거는 preview·beta인데 정식 제공(GA)이라고 씀", sec.where);
          } else if (once("rollout_unverified", "ga")) add("FACT", "REVIEW", "rollout_unverified", "정식 제공(GA) 표현 — 근거에 GA 문구 없음", sec.where);
        }
        if (PREVIEW_KO.test(sent) && !negated && !PREVIEW_EN.test(allowed) && !PREVIEW_KO.test(allowed) && once("rollout_mismatch", "preview")) add("FACT", "FAIL", "rollout_mismatch", "근거에 없는 preview·beta 표현", sec.where);
        // API 제공
        if (/\bAPI\b/.test(sent) && !negated && !/\bAPIs?\b/i.test(allowed) && once("unsupported_api", "api")) add("FACT", "FAIL", "unsupported_api", "근거에 API 제공 언급이 없음", sec.where);
        // 해석은 사실 칸에 두지 않는다
        if (sec.fact && SPECULATION.test(sent) && once("interpretation_in_facts", sec.where)) add("EDITORIAL", "REVIEW", "interpretation_in_facts", "공식 사실 칸에 추측·전망 표현", sec.where);
        // 시장 전망 (근거 없는)
        if (MARKET.test(sent) && SPECULATION.test(sent) && !/(market|share|revenue)/i.test(allowed) && once("market_speculation", sec.where)) add("SAFETY", "FAIL", "market_speculation", "근거 없는 시장 전망", sec.where);
        // 회사 주장 출처 표시
        if (SUPERLATIVE.test(sent) && !ATTRIB.test(sent) && once("company_claim_unattributed", sec.where)) add("SAFETY", "REVIEW", "company_claim_unattributed", "최고·최초 같은 회사 주장에 출처 표시 없음", sec.where);
        if (RELATIVE.test(sent) && once("relative_date", "x")) add("EDITORIAL", "REVIEW", "relative_date", "상대 날짜 표현 (근거의 날짜로)", sec.where);
      }
    }
  }

  // 제품·모델 이름과 버전: 'GPT-6' ≠ 'GPT-6.1'
  const draftAll = [d.title, d.summary, ...(d.facts ?? []).map((f) => f.text), ...(d.checks ?? []).map((c) => c.text), d.why?.text, d.change?.text, ...(d.products ?? [])].filter(Boolean).join("\n");
  // 버전 뒤의 이름(Sol·Astra·Pro …)까지 한 이름으로 본다: 'GPT-6 Sol'은 근거의 'GPT-6 Astra'로 통과시키지 않는다
  for (const m of draftAll.matchAll(/\b([A-Z][A-Za-z]+(?:[ -][A-Z][A-Za-z]+)*)[ -](\d+(?:\.\d+)*)\b(?: ([A-Z][a-z]+)\b)?/g)) {
    const [, base, ver, suffix] = m;
    const name = `${base} ${ver}${suffix ? ` ${suffix}` : ""}`;
    const has = (v, sfx) => new RegExp(`(^|[^\\w.])${esc(base)}[ -]${esc(v)}${sfx ? ` ${esc(sfx)}` : ""}(?![\\w]|\\.\\d)`, "i").test(allowed);
    if (has(ver, suffix) || (suffix && has(ver, null) && !new RegExp(`(^|[^\\w.])${esc(base)}[ -]${esc(ver)} [A-Z][a-z]+`, "").test(allowed))) continue;
    const others = [...allowed.matchAll(new RegExp(`(?:^|[^\\w.])${esc(base)}[ -](\\d+(?:\\.\\d+)*)(?: ([A-Z][a-z]+))?`, "gi"))].map((x) => `${base} ${x[1]}${x[2] ? ` ${x[2]}` : ""}`);
    if (others.length) {
      if (once("model_version_mismatch", name)) add("FACT", "FAIL", "model_version_mismatch", `모델·버전 '${name}' — 근거에는 ${[...new Set(others)].join(", ")}`);
    } else if (once("unsupported_name", name)) add("FACT", "FAIL", "unsupported_name", `근거에 없는 제품·모델 이름 '${name}'`);
  }
  for (const p of d.products ?? []) if (!mentionsProduct(allowed, p) && !allowedLower.includes(String(p).toLowerCase()) && once("unsupported_name", p)) add("FACT", "FAIL", "unsupported_name", `products의 '${p}'가 근거에 없음`);
  for (const w of new Set(draftAll.match(/\b[A-Z][A-Za-z0-9+.-]{2,}\b/g) ?? [])) {
    if (TERM_WHITELIST.has(w) || allowedLower.includes(w.toLowerCase())) continue;
    if (once("unverified_term", w)) add("FACT", "REVIEW", "unverified_term", `근거에서 찾지 못한 영문 이름 '${w}'`);
  }

  // --- SAFETY: 허위 사용 경험 · 과장
  const everything = [draftAll, ...(d.unknowns ?? []), d.notes ?? ""].join("\n");
  if (FAKE_EXPERIENCE.test(everything)) add("SAFETY", "FAIL", "fake_experience", "직접 사용·측정한 것처럼 씀 (AI마중은 이 기사를 위해 직접 시험하지 않음)");
  for (const k of ["tested", "handsOn", "verifiedByUse", "badge"]) if (d[k]) add("SAFETY", "FAIL", "fake_experience", `직접 사용 표시(${k})는 자동 초안에 붙이지 않음`);
  if (d.title && HYPE_TITLE.test(d.title)) add("SAFETY", "FAIL", "hype_title", "과장·광고성 제목");
  const bodyText = draftAll.replace(d.title ?? "", "");
  if (HYPE_BODY.test(bodyText)) add("SAFETY", "REVIEW", "hype_expression", "과장·광고성 표현");

  // --- EDITORIAL: 반복 · 해석과 사실 구분 · mock
  const sents = splitSentences([d.summary, ...(d.facts ?? []).map((f) => f.text), d.why?.text, d.change?.text].filter(Boolean).join(" ")).filter((s) => s.length > 15);
  if (new Set(sents).size !== sents.length) add("EDITORIAL", "REVIEW", "duplicate_sentence", "같은 문장 반복");
  if (d.why?.text && (d.facts ?? []).some((f) => f.text === d.why.text)) add("EDITORIAL", "REVIEW", "interpretation_equals_fact", "'왜 중요한가'가 사실 문장을 되풀이함 (해석 없음)");
  if (/\[MOCK\]/.test(d.title ?? "")) add("EDITORIAL", "REVIEW", "mock_draft", "mock 원고 — 시험용, 승인 불가");

  // --- DUPLICATE
  if (dup?.result === "DUPLICATE") add("DUPLICATE", "FAIL", "duplicate", `기존 기사와 중복: ${dup.reason}`);
  if (dup?.result === "UNCERTAIN") add("DUPLICATE", "REVIEW", "duplicate_uncertain", `같은 사안인지 불확실: ${dup.reason}`);
  if (dup?.result === "UPDATE_EXISTING") add("DUPLICATE", "REVIEW", "update_existing", `기존 기사 ${dup.matchSlug}의 후속 — 새 기사로 낼지 기존 기사를 고칠지 판단`);
  for (const s of existing?.stories ?? []) if (d.title && titleSimilarity(d.title, s.title) >= 0.6) {
    add("DUPLICATE", "REVIEW", "similar_existing_title", `기존 기사 제목과 비슷함: ${s.slug}`);
    break;
  }

  // 기존 검증의 확인 신호(근거 없는 숫자 등)도 함께 (승인 시 --ack 대상)
  const hasFail = issues.some((i) => i.severity === "FAIL");
  // validateDraft의 거친 신호 중 위에서 더 정밀하게 다시 본 것은 빼고 (나머지: 날짜 불일치·중복 불확실 등)
  const SUPERSEDED = new Set(["numeric_claim", "price_unsupported", "unsupported_name", "rollout_uncertain", "korea_claim_unsupported", "company_claim_unattributed", "relative_date", "duplicate_sentence", "source_blocked", "insufficient_evidence"]);
  const keptFlags = v.needsReview.filter((f) => !SUPERSEDED.has(f));
  const reviewCodes = [...new Set([...keptFlags, ...issues.filter((i) => i.severity === "REVIEW").map((i) => i.code)])];
  const checks = Object.fromEntries(DIMS.map((k) => {
    const mine = issues.filter((i) => i.dim === k);
    return [k, { result: mine.some((i) => i.severity === "FAIL") ? "FAIL" : mine.length ? "REVIEW" : "PASS", issues: mine.map((i) => `${i.msg}${i.where ? ` (${i.where})` : ""}`) }];
  }));
  const verdict = hasFail ? "FAIL" : reviewCodes.length ? "REVIEW" : "PASS";
  const fixes = issues.map((i) => `[${i.dim}/${i.severity}] ${i.msg}${i.where ? ` (${i.where})` : ""}`);
  for (const f of keptFlags) if (!issues.some((i) => i.code === f)) fixes.push(`[CHECK] ${f}`);
  return { verdict, checks, issues, fixes, needsReview: reviewCodes, errors: v.errors, stats: { bodyChars: len, depth: depth ?? null, suggestedDepth: suggestedDepth ?? null } };
}

// ---------- 4) 기록 · 표시 ----------

export function buildDraftRecord(r, { date, generatedAt }) {
  const ev = r.evidence;
  return {
    candidateId: r.item.id,
    date,
    status: "draft_for_editor_review", // 발행 승인 아님
    title: r.draft?.title ?? null,
    source: { name: r.item.sourceName, url: r.item.url, title: r.item.title, publishedAt: r.item.publishedAt, type: r.item.sourceType },
    evidenceSummary: {
      status: ev.status,
      grade: ev.grade,
      sentences: ev.ledger.length,
      bodySentences: ev.ledger.filter((e) => e.kind === "body").length,
      distinctFacts: r.facts,
      checkedAt: ev.ledger[0]?.checkedAt ?? null,
      ledger: ev.ledger.map((e) => ({ id: e.id, kind: e.kind, text: e.text })),
    },
    articleType: r.draft?.editorialDepth ?? null,
    suggestedDepth: r.depth,
    duplicate: { result: r.dup.result, reason: r.dup.reason, matchSlug: r.dup.matchSlug ?? null },
    draft: r.draft,
    handsOn: false, // 직접 사용·측정하지 않음 — '직접 써봄·직접 재봄' 표시 금지
    qa: { verdict: r.draftQa.verdict, checks: r.draftQa.checks, stats: r.draftQa.stats },
    fixes: r.draftQa.fixes,
    approvable: r.draftQa.verdict !== "FAIL" && r.generation.provider !== "mock",
    generation: {
      provider: r.generation.provider,
      model: r.generation.model,
      promptVersion: r.generation.promptVersion ?? null,
      usage: r.generation.usage ?? null,
      reused: !!r.generation.reused,
      generatedAt: r.generation.at ?? generatedAt,
      evidenceHash: r.generation.evidenceHash,
    },
  };
}

const QA_ICON = { PASS: "✅", REVIEW: "⚠️", FAIL: "⛔" };
const refs = (ids) => (ids?.length ? ` \`${ids.join(",")}\`` : "");

/** 기사 본문 부분 (보고서에도 쓴다) */
export function renderArticle(rec) {
  const d = rec.draft ?? {};
  const L = [];
  L.push(`**핵심 요약** ${d.summary ?? ""}`, "");
  L.push("**무엇이 달라졌나** (공식 발표로 확인된 사실)");
  for (const f of d.facts ?? []) L.push(`- ${f.text}${refs(f.evidence)}`);
  L.push("", "**왜 중요한가** (AI마중의 해석)", `${d.why?.text ?? ""}${refs(d.why?.evidence)}`);
  if (d.change?.text) L.push("", `${d.change.text}${refs(d.change.evidence)}`);
  L.push("", "**독자가 확인할 사항**");
  for (const c of d.checks ?? []) L.push(`- ${c.text}${refs(c.evidence)}`);
  if (!(d.checks ?? []).length) L.push("- (없음 — 편집자 보완 필요)");
  L.push("", "**아직 확인되지 않은 부분**");
  for (const u of d.unknowns ?? []) L.push(`- ${u}`);
  if (!(d.unknowns ?? []).length) L.push("- (없음)");
  L.push("", "**출처 및 확인 범위**");
  L.push(`- 원문: [${rec.source.name} — ${rec.source.title}](${rec.source.url}) · 발표 ${String(rec.source.publishedAt).slice(0, 10)}`);
  L.push(`- 확인 범위: 원문 ${rec.evidenceSummary.status} · 근거 문장 ${rec.evidenceSummary.sentences}개(원문 발췌 ${rec.evidenceSummary.bodySentences}) · 확인 ${String(rec.evidenceSummary.checkedAt ?? "").slice(0, 16).replace("T", " ")} UTC`);
  L.push("- 직접 사용 여부: AI마중은 이 기능을 직접 써 보지 않았습니다 (공식 발표 기준)");
  return L;
}

export function renderDraftMarkdown(rec) {
  const L = [];
  L.push(`# ${rec.title ?? rec.source.title}`, "");
  L.push(`> 🤖 **AI 초안 — 편집자 검토 전, 발행 승인 아님.** 자동 QA ${QA_ICON[rec.qa.verdict]} **${rec.qa.verdict}** · 유형 ${rec.articleType ?? "-"} (근거 기준 최대 ${rec.suggestedDepth}) · 후보 \`${rec.candidateId}\``, "");
  L.push(...renderArticle(rec), "");
  L.push("---", "", `## 자동 QA: ${QA_ICON[rec.qa.verdict]} ${rec.qa.verdict}`, "");
  L.push("| 항목 | 결과 | 내용 |", "|---|---|---|");
  for (const [k, c] of Object.entries(rec.qa.checks)) L.push(`| ${k} | ${QA_ICON[c.result]} ${c.result} | ${c.issues.join(" · ").replace(/\|/g, "/") || "-"} |`);
  L.push("", "### 수정 필요 사항");
  if (!rec.fixes.length) L.push("- 자동 점검에서 찾은 항목 없음 — 그래도 사람이 원문과 대조해 확인");
  for (const f of rec.fixes) L.push(`- ${f}`);
  L.push("", "### 근거 장부");
  for (const e of rec.evidenceSummary.ledger) L.push(`- \`${e.id}\` (${e.kind}) ${e.text}`);
  const g = rec.generation;
  L.push("", "### 생성 정보");
  L.push(`- ${g.provider} · 모델 ${g.model ?? "-"} · 프롬프트 ${g.promptVersion ?? "-"}${g.reused ? " · 이전 생성 재사용(추가 호출 없음)" : ""}`);
  L.push(`- 토큰 입력 ${g.usage?.inputTokens ?? 0} · 출력 ${g.usage?.outputTokens ?? 0} · 예상 비용 $${(g.usage?.costUsd ?? 0).toFixed(4)} · 생성 ${g.generatedAt}`);
  L.push(`- 승인: ${rec.approvable ? "편집자가 확인 후 `npm run daily:approve`" : "불가 (" + (rec.qa.verdict === "FAIL" ? "QA FAIL" : "mock 원고") + ")"}`, "");
  return L.join("\n");
}
