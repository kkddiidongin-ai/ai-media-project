/**
 * DAILY 편집 선정 (Phase 7.1.1 Selection Quality Calibration)
 *
 *   수집 → (메타데이터) 유형·사건 신호·우선순위 → 명백한 저가치 제외 → 넓은 근거 확인 명단(shortlist)
 *   → 근거 확인 → 재평가 → 최종 발행 추천 (상한·회사 다양성)
 *
 * 원칙
 *  - 중요도(importance)는 '무슨 사건인가'(사건 신호)로만 정한다. 출처 등급·원문 접근 가능 여부는 중요도를 올리지 않는다
 *    (접근 가능 여부는 verificationConfidence와 근거 충분성에만 쓴다).
 *  - 하루 상한은 '최종 발행 추천'에 건다. 근거를 보기도 전에 상위 몇 건만 자르지 않는다 (근거 요청 수 상한은 따로).
 *  - 글 유형(사용법·고객 사례·행사·채용·의견·문서 갱신·홍보)은 감점한다. 단 가격·정책·보안·모델·정식 제공 같은
 *    강한 사건 신호가 있으면 제목 유형만으로 제외하지 않는다.
 *  - 키워드만으로 발행 추천하지 않는다. 최종 추천은 근거 확인을 통과해야 한다.
 */

// ---------- 글 유형 (감점) ----------

const TYPE_RULES = [
  // [유형, 감점, 제목 패턴, 설명(발췌) 패턴]
  ["HOW_TO", -3, /\b(how to|step[- ]by[- ]step|tutorial|walkthrough|best practices|cheat sheet|getting started)\b/i, /\b(this post (shows|walks|explores|demonstrates|describes)|learn how (to|you)|walks? through|step[- ]by[- ]step|in this post)\b/i],
  // 제목이 명령형 동사로 시작하는 사용법 글 (발췌에 발표 동사가 있으면 적용하지 않음 — 아래 classifyType)
  ["HOW_TO_TITLE", -3, /^(build|building|manage|deploy|deploying|create|creating|evaluating|evaluate|downgrading|migrat\w*|optimi[sz]\w*|automat\w*|accelerat\w*|supercharge|agentic retrieval with|making [\w\s]{2,30} enterprise-ready)\b/i, null],
  ["CUSTOMER_STORY", -3, /\b[Hh]ow [A-Z][\w&.'-]*(?: [A-Z][\w&.'-]*)? (is|are|uses|use|scales|scaling|builds|built|helps|cut|cuts|turned|transforms|reduced|saved)\b|\b([Cc]ustomer stor(y|ies)|[Cc]ase study)\b/, /\b(uses (openai|chatgpt|claude|gemini|copilot|nvidia|aws)|learn how [A-Z][\w&.'-]* (and|is|are|uses)|customer stor(y|ies)|case study)\b/i],
  ["INDUSTRY_STORY", -2, /\b(ai helps|helps (close|fight|improve|transform|tackle)|transforming (healthcare|industry|the)|making [\w\s]{2,40} more (proactive|efficient|accessible))\b|^ask a\b|^(meet|spotlight|behind the)\b/i, null],
  ["THOUGHT_LEADERSHIP", -2, /^why\b|\b(the future of|lessons (from|learned)|what we learned|perspectives?|may be the|you've never heard of|riskiest)\b/i, /\b(we explore|thought leadership)\b/i],
  ["EVENT", -4, /\b(webinar|livestream|summit|conference|hackathon|meetup|register now|save the date|join us|recap)\b/i, null],
  ["HIRING", -4, /\b(hiring|careers?|we're hiring|join (our|the) team|appointed|named (chief|head|ceo|cto)|welcomes)\b/i, null],
  ["DOCS_ONLY", -2, /\b(update your (ide|client|app|extension) to|enablement status|usage metrics|coverage view|documentation|docs update|release notes)\b/i, /\b(administrators can now see|we've found the cause|now shows|in the docs)\b/i],
  ["MARKETING", -2, /\b(\d+ ways to|tips (for|to)|unlock|boost your|transform your|everything you need to know)\b/i, null],
  ["RESEARCH_PAPER", -1, /^$/, /\b(we propose|existing (methods|approaches)|in this paper|has attracted increasing attention|designed artifacts are)\b/i],
];

const ANNOUNCE_RE = /\b(introduc\w*|launch\w*|announc\w*|now available|(are|is) available (on|in)|unveil\w*|releas\w*)\b/i;

export function classifyType(item) {
  const title = item.title ?? "";
  const excerpt = item.excerpt ?? "";
  const hits = [];
  const announces = ANNOUNCE_RE.test(excerpt);
  for (const [type, penalty, tRe, eRe] of TYPE_RULES) {
    if (type === "HOW_TO_TITLE") {
      if (tRe.test(title) && !announces) hits.push({ type: "HOW_TO", penalty });
      continue;
    }
    // 발췌의 '사용법' 표현(learn how …)은 발표 글 끝에도 붙으므로, 발표 동사가 있으면 사용법으로 보지 않는다
    const excerptHit = eRe && eRe.test(excerpt) && !(type === "HOW_TO" && announces);
    if (tRe.test(title) || excerptHit) hits.push({ type, penalty });
  }
  // 가장 큰 감점 하나만 (중복 감점으로 과하게 깎지 않음)
  hits.sort((a, b) => a.penalty - b.penalty);
  return hits[0] ?? { type: "NEWS", penalty: 0 };
}

// ---------- 사건 신호 (중요도) ----------

const SIGNALS = [
  // [가족, 가중치, 패턴, 강한 신호 여부]
  // 모델 출시: 발표 동사 + 모델, 또는 '이름 버전: … model' 형태 제목. 'open models' 같은 일반 언급은 MODEL_MENTION(약한 신호)
  ["MODEL", 3, /\b(introduc\w*|launch\w*|releas\w*|unveil\w*|announc\w*|now available)\b[^.]{0,80}\b(models?|gpt-?\d[\w.]*|gemini|claude|llama|gemma|grok|nemotron|glm|qwen|mistral)\b|^[A-Z][\w-]+ \d[\w.]*:[^.]*\bmodel\b/i, true],
  ["MODEL_MENTION", 1, /\b(frontier|open|embedding|multimodal|reasoning|internal) models?\b|\bmodel family\b/i, false],
  ["PRODUCT_LAUNCH", 2, /\b(introduc(es|ing|ed)|launch(es|ed|ing)?|rolling out|rolls out|now available|can now|new (app|platform|feature|tool|product|program|version))\b/i, false],
  ["PRICING", 3, /\b(pric(e|es|ing)|free tier|credits?|billing|subscription|per (month|seat|token)|\$\d)/i, true],
  ["AVAILABILITY", 2, /\b(generally available|general availability|\bGA\b|now available (in|on|to|for)|available (in|on) [\w\s()]{0,40}regions?|globally|worldwide|in \d+ (countries|regions|languages)|expand(s|ed|ing)? (access|to)|standalone platform)\b/i, true],
  ["PREVIEW", 1, /\b(preview|beta|early access|experimental|waitlist)\b/i, false],
  ["PARTNERSHIP", 2, /\b(partnership|partners with|partnering with|in collaboration with|teams? up with|alliance)\b/i, false],
  ["ACQ_INVEST", 3, /\b(acquir(es|ed|ing)|acquisition|investment of \$|\$[\d.]+ ?(billion|million|bn|m) (investment|round|funding)|funding round|raises? \$|valuation|stake in)\b/i, true],
  ["REGULATION", 3, /\b(regulat(ion|ions|ory|or|ors)|legislation|laws?\b|AI Act|EU rules|government|court|lawsuit|ruling|provenance rules|public policy|policymakers)\b/i, true],
  // 보안·안전 '사건·정책': 사고·취약점·악용·사이버 방어 프로그램·워터마크·출처 표시
  ["SECURITY", 2, /\b(vulnerabilit(y|ies)|incident|breach|attack(s|ed|ers)?|exploit(s|ed)?|malicious|hack(s|ed|ing)?|misuse|jailbreak|watermark\w*|provenance|identify (whether|ai-generated)|cyber (capabilities|verification|defen[cs]e|attack\w*|threats?)|verification program|safety (policy|framework|program|evaluation|report))\b/i, true],
  // 'security test'·'secure' 같은 단어 언급은 약한 신호 (배경 맥락으로 치지 않음)
  ["SECURITY_MENTION", 1, /\b(security|secure|safety|cyber\w*)\b/i, false],
  ["RESEARCH_RESULT", 2, /\b(benchmark|state[- ]of[- ]the[- ]art|sota|gold[- ]level|gold medal|\bIMO\b|\bIOI\b|open problems|breakthrough|new results)\b/i, false],
  ["INFRA", 2, /\b(chips?|gpus?|tpus?|trainium|data ?cent(er|re)s?|supercomputer|compute capacity|gigawatt|infrastructure)\b/i, false],
  ["API_PLATFORM", 1, /\b(API|SDK|developer platform|endpoints?|Bedrock|Vertex AI|AI Foundry|toolkit)\b/, false],
  ["CONSUMER", 1, /\b(ChatGPT|Gemini app|Google (Docs|Drive|Photos|Search)|Copilot app|Claude app|for everyone|all users)\b/i, false],
  ["KOREA", 3, /\b(korea|korean|seoul|samsung|naver|kakao|sk hynix|sk telecom)\b/i, true],
];
// 파트너십·투자가 실제 사업·제품 효과를 갖는지 (기업 고객·통합·모델 공급 등)
const MATERIAL_RE = /\b(enterprise|integrat\w*|customers|frontier models?|bring\w* .* to|deploy\w* .* across|available (in|to)|work(flows)?|platform)\b/i;

export function eventSignals(item) {
  const text = `${item.title ?? ""} ${item.excerpt ?? ""}`;
  const families = [];
  for (const [family, weight, re, strong] of SIGNALS) if (re.test(text)) families.push({ family, weight, strong });
  const p = families.find((f) => f.family === "PARTNERSHIP");
  if (p && MATERIAL_RE.test(text)) p.weight += 1;
  return families;
}

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

/**
 * 메타데이터만으로 매기는 점수 (원문을 열기 전, 비용 0)
 * importance: 사건 신호 상위 3개 가중치 합 / 2 (출처 등급·접근성 미반영)
 * priority: importance·실용성·한국 관련성·새로움 + 유형 감점 → 근거 확인 순서
 */
export function metadataScore(item, dup) {
  const families = eventSignals(item);
  const type = classifyType(item);
  const top3 = [...families].sort((a, b) => b.weight - a.weight).slice(0, 3);
  const signalScore = top3.reduce((n, f) => n + f.weight, 0);
  const has = (f) => families.some((x) => x.family === f);
  const importance = clamp(Math.round(signalScore / 2), 0, 5);
  const practicalImpact = clamp((has("PRODUCT_LAUNCH") ? 1 : 0) + (has("AVAILABILITY") ? 1 : 0) + (has("PRICING") ? 1 : 0) + (has("API_PLATFORM") || has("CONSUMER") ? 1 : 0), 0, 3);
  const koreanRelevance = has("KOREA") ? 3 : has("AVAILABILITY") && /\b(globally|worldwide|all (countries|regions))\b/i.test(`${item.title} ${item.excerpt}`) ? 1 : 0;
  const novelty = { NEW: 2, UPDATE_EXISTING: 1, UNCERTAIN: 0, DUPLICATE: 0 }[dup.result] ?? 0;
  const strong = families.some((f) => f.strong);
  const priority = importance * 2 + practicalImpact + koreanRelevance + novelty + type.penalty;
  return {
    importance,
    practicalImpact,
    koreanRelevance,
    novelty,
    // 출처 품질·검증 가능성은 따로 기록하되 우선순위·중요도에는 넣지 않는다
    sourceQuality: item.sourceType === "official" ? (item.tier === 1 ? 3 : 2) : 1,
    verificationConfidence: clamp((item.datePrecision === "month" ? 0 : 1) + ((item.excerpt ?? "").length >= 120 ? 1 : 0), 0, 3),
    signals: families.map((f) => f.family),
    strongSignal: strong,
    contentType: type.type,
    typePenalty: type.penalty,
    priority,
    total: priority, // 이전 보고서·도구 호환
  };
}

export const SHORTLIST_MIN = 4; // 근거 확인 대상 최소 우선순위
export const PUBLISH_MIN = 6; // 근거 확인 후 발행 추천 최소 우선순위

/** 1차 판정 (메타데이터): CANDIDATE(근거 확인 대상) · HOLD · EXCLUDE */
export function screenDecision(item, dup, s) {
  if (dup.result === "DUPLICATE") return { decision: "EXCLUDE", reasons: [`중복: ${dup.reason}`] };
  if (dup.result === "UNCERTAIN") return { decision: "HOLD", reasons: [`중복 불확실: ${dup.reason}`], needsReview: ["duplicate_uncertain"] };
  if (item.datePrecision === "month") return { decision: "HOLD", reasons: ["발표일(일자)을 알 수 없음 — 날짜를 지어내지 않는다"], needsReview: ["date_conflict"] };
  if (s.typePenalty < 0 && !s.strongSignal) return { decision: "EXCLUDE", reasons: [`글 유형 ${s.contentType} — 강한 사건 신호 없음`] };
  if (!s.signals.length) return { decision: "EXCLUDE", reasons: ["사건 신호 없음 (독자에게 바뀌는 것이 보이지 않음)"] };
  if (s.priority >= SHORTLIST_MIN && item.sourceType !== "official")
    return { decision: "HOLD", reasons: [`언론 보도(2차 출처) — 공식 발표로 확인되면 다시 검토 (사건 신호 ${s.signals.join("·")})`], needsReview: ["press_only"] };
  if (s.priority >= SHORTLIST_MIN) return { decision: "CANDIDATE", reasons: [`사건 신호 ${s.signals.join("·")} (우선순위 ${s.priority})`] };
  return { decision: "HOLD", reasons: [`우선순위 ${s.priority} — 근거 확인 기준(${SHORTLIST_MIN}) 미달`] };
}

// ---------- 근거 확인 후 ----------

const NUM = /\d/;
const PROPER = /\b[A-Z][a-zA-Z0-9.-]+(?:\s[A-Z][a-zA-Z0-9.-]+)*/;
const words = (s) => new Set(String(s).toLowerCase().split(/\W+/).filter((w) => w.length > 2));
const jaccard = (a, b) => {
  const A = words(a);
  const B = words(b);
  const inter = [...A].filter((w) => B.has(w)).length;
  return A.size + B.size ? inter / (A.size + B.size - inter) : 0;
};

/** 근거 장부에서 서로 다른 '확인 가능한 사실' 수 (숫자나 고유명사가 있고, 거의 같은 문장은 하나로) */
export function distinctFacts(evidence) {
  const out = [];
  for (const e of evidence.ledger.filter((x) => x.kind === "body")) {
    if (!(NUM.test(e.text) || PROPER.test(e.text.slice(1)))) continue;
    if (out.some((o) => jaccard(o, e.text) >= 0.6)) continue;
    out.push(e.text);
  }
  return out.length;
}

/** 근거 충분성 (길이·문장 수는 여기에만 쓴다): SUFFICIENT_STANDARD · SUFFICIENT_SHORT · INSUFFICIENT */
export function evidenceSufficiency(evidence, facts) {
  if ((evidence.grade === "PASS" || evidence.grade === "LIMITED") && facts >= 4) return "SUFFICIENT_STANDARD";
  if (facts >= 2 || (evidence.status !== "OK" && evidence.ledger.length >= 3)) return "SUFFICIENT_SHORT";
  return "INSUFFICIENT";
}

const CONTEXT_FAMILIES = ["REGULATION", "SECURITY", "PARTNERSHIP", "ACQ_INVEST", "PRICING", "INFRA", "KOREA"];

/**
 * 깊이 판단. 페이지가 길다는 이유만으로 DEEP을 제안하지 않는다.
 * DEEP 제안은 아래가 모두 참일 때만 (DEEP은 자동 원고·자동 발행 대상이 아니다):
 *   중요도 4+ · 새 사안 · 사용자 영향(실용성 2+ 또는 가격·한국) · 배경 설명 필요(맥락 가족 1+ 그리고 신호 가족 2+)
 *   · 서로 다른 확인 사실 6+ · 근거 PASS · STANDARD(사실 5개 이하)로는 중요한 맥락이 빠짐(사실 6+ & 배경 필요)
 */
export function assessDepth(s, evidence, facts, dup) {
  const suff = evidenceSufficiency(evidence, facts);
  const contextNeed = s.signals.some((f) => CONTEXT_FAMILIES.includes(f)) && s.signals.length >= 2;
  const checks = {
    importance: s.importance >= 4,
    novelty: dup.result === "NEW",
    userImpact: s.practicalImpact >= 2 || s.signals.includes("PRICING") || s.signals.includes("KOREA"),
    contextNeed,
    distinctFacts: facts >= 6,
    evidenceQuality: evidence.grade === "PASS",
    standardWouldOmit: facts >= 6 && contextNeed,
  };
  const failed = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
  let depth = null;
  if (suff === "SUFFICIENT_STANDARD" && !failed.length) depth = "DEEP";
  else if (suff === "SUFFICIENT_STANDARD" && (s.practicalImpact >= 1 || contextNeed)) depth = "STANDARD";
  else if (suff !== "INSUFFICIENT") depth = "SHORT";
  return { depth, sufficiency: suff, deepChecks: checks, deepMissing: failed };
}

// ---------- 회사 · 최종 선정 ----------

const COMPANY = [
  [/^openai/, "OpenAI"],
  [/^(anthropic|claude)/, "Anthropic"],
  [/^google/, "Google"],
  [/^(microsoft)/, "Microsoft"],
  [/^github/, "GitHub"],
  [/^nvidia/, "NVIDIA"],
  [/^aws/, "Amazon"],
  [/^meta/, "Meta"],
  [/^xai/, "xAI"],
  [/^samsung/, "Samsung"],
  [/^apple/, "Apple"],
  [/^huggingface/, "Hugging Face"],
  [/^mistral/, "Mistral"],
];
export const companyOf = (item) => COMPANY.find(([re]) => re.test(item.sourceId ?? ""))?.[1] ?? item.sourceName ?? "기타";

/**
 * 최종 발행 추천: 우선순위 순, 상한 maxPublish.
 * 회사 다양성(부드러운 규칙): 같은 회사는 perCompany건까지 먼저 고르고, 그 이상은 다른 회사의 남은 후보보다
 * 우선순위가 margin 이상 높을 때만 앞서 넣는다. 다른 회사 후보가 없으면 같은 회사 기사로 채운다 (억지로 끼워 넣지 않음).
 * @returns {{ picked: object[], capDropped: object[], diversityDeferred: object[] }}
 */
export function finalSelect(eligible, { maxPublish, perCompany = 2, margin = 3 }) {
  const pool = [...eligible].sort((a, b) => b.score.priority - a.score.priority || b.facts - a.facts);
  const picked = [];
  const deferred = [];
  const count = (c) => picked.filter((x) => x.company === c).length;
  for (const r of pool) {
    if (picked.length >= maxPublish) break;
    if (count(r.company) < perCompany) {
      picked.push(r);
      continue;
    }
    const bestOther = pool.find((x) => !picked.includes(x) && !deferred.includes(x) && x !== r && count(x.company) < perCompany);
    if (!bestOther || r.score.priority >= bestOther.score.priority + margin) picked.push(r);
    else deferred.push(r);
  }
  for (const r of deferred) if (picked.length < maxPublish && !picked.includes(r)) picked.push(r);
  const diversityDeferred = deferred.filter((r) => !picked.includes(r));
  const capDropped = pool.filter((r) => !picked.includes(r) && !diversityDeferred.includes(r));
  return { picked, capDropped, diversityDeferred };
}
