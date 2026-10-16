/**
 * 원고 생성 공급자 (provider) — 특정 회사 API에 묶이지 않게 한 겹 둔다.
 *
 *   generateArticle(candidate, evidence, ctx) → { status, draft?, model?, usage?, error? }
 *
 * 공급자 (DAILY_LLM_PROVIDER):
 *   none       생성을 끈 상태. 생성하지 않고 'skipped'로 보고한다 (가짜 원고를 만들지 않는다)
 *   mock       시험용. 근거 문장을 옮긴 표시용 원고 — 승인 불가 (provider: mock), 외부 요청·비용 없음
 *   anthropic  Anthropic Messages API (ANTHROPIC_API_KEY, DAILY_LLM_MODEL)
 * 새 공급자는 PROVIDERS에 같은 모양의 함수를 더하면 된다.
 *
 * 비용 상한 (모두 호출 '전'에 확인):
 *   - 하루 호출 수 maxLlmCalls
 *   - 하루 예상 비용 maxCostUsd: 이번 호출의 최악 비용(입력 추정 + max_tokens 전부)을 더해 넘으면 부르지 않는다
 *   - 호출당 timeout · 재시도 llmRetries (429·5xx·timeout만)
 * 키 값은 어디에도 쓰지 않는다 (오류 문장에서도 지운다).
 */

/** 프롬프트·출력 형식 버전: 바뀌면 같은 후보라도 새로 만든다 (그 전엔 재사용) */
export const PROMPT_VERSION = "draft-v1";

/**
 * 확인한 모델만 쓴다. 출처: https://platform.claude.com/docs/en/about-claude/models/overview ·
 * https://platform.claude.com/docs/en/build-with-claude/effort (2026-10-11 확인).
 * 요금(USD / 100만 토큰)은 기본값일 뿐 — DAILY_LLM_PRICE_INPUT·DAILY_LLM_PRICE_OUTPUT로 바꿀 수 있다.
 * 'From' 요금처럼 하나로 정해지지 않은 모델(claude-haiku-5-5)은 요금을 직접 넣어야 쓸 수 있다.
 * thinking: Sonnet 5.5는 {type:"between_tools"}로 앞단 사고를 끌 수 있다(effort low·medium·high에서만). 다른 모델은 보내지 않는다.
 */
export const MODELS = {
  "claude-sonnet-5-5": { inputPerMTok: 2, outputPerMTok: 10, thinking: { type: "between_tools" }, verified: "2026-10-11" },
  "claude-opus-5-5": { inputPerMTok: 4, outputPerMTok: 20, verified: "2026-10-11" },
  "claude-fable-5-1": { inputPerMTok: 10, outputPerMTok: 50, verified: "2026-10-11" },
  "claude-haiku-5-5": { inputPerMTok: null, outputPerMTok: null, verified: "2026-10-11" },
};
export const DEFAULT_MODEL = "claude-sonnet-5-5";
const EFFORTS = ["low", "medium", "high"];

const num = (v) => (typeof v === "string" && /^\d+(\.\d+)?$/.test(v.trim()) ? Number(v.trim()) : null);

/**
 * 모델·요금·effort 설정. 확인되지 않은 모델 이름이나 요금 없는 모델은 error를 돌려준다 (호출하지 않음).
 */
export function resolveModelConfig(env = process.env) {
  const model = String(env.DAILY_LLM_MODEL ?? "").trim() || DEFAULT_MODEL;
  const known = MODELS[model];
  if (!known) return { model, error: `확인되지 않은 모델 이름 '${model}' — 사용 가능: ${Object.keys(MODELS).join(", ")}` };
  const inputPerMTok = num(env.DAILY_LLM_PRICE_INPUT) ?? known.inputPerMTok;
  const outputPerMTok = num(env.DAILY_LLM_PRICE_OUTPUT) ?? known.outputPerMTok;
  if (inputPerMTok == null || outputPerMTok == null) return { model, error: `${model}의 요금이 정해지지 않음 — DAILY_LLM_PRICE_INPUT·DAILY_LLM_PRICE_OUTPUT(USD/100만 토큰)을 넣어야 비용 상한을 지킬 수 있음` };
  const effortRaw = String(env.DAILY_LLM_EFFORT ?? "").trim().toLowerCase();
  const effort = EFFORTS.includes(effortRaw) ? effortRaw : "medium";
  return { model, inputPerMTok, outputPerMTok, effort, thinking: known.thinking ?? null };
}

/** 요금표로 비용 계산 (USD) */
export const costOf = (inTok, outTok, cfg) => (inTok * cfg.inputPerMTok + outTok * cfg.outputPerMTok) / 1_000_000;
/** 호출 전 입력 토큰 추정: 보수적으로 글자 2개 = 1토큰 (한국어·영어 섞임) */
export const estimateTokens = (text) => Math.ceil(String(text).length / 2);

/** 오류 문장 등에서 키를 지운다 */
export function redact(s, env = {}) {
  let out = String(s ?? "");
  for (const k of [env.ANTHROPIC_API_KEY].filter((x) => x && x.length >= 8)) out = out.split(k).join("[REDACTED]");
  return out.replace(/sk-ant-[A-Za-z0-9_-]{6,}/g, "[REDACTED]");
}

export const SYSTEM = `당신은 한국어 AI 뉴스 미디어 'AI마중'의 편집 보조입니다. 브랜드: "AI의 변화를 먼저 마중 나갑니다." 편집 원칙: "AI, 해본 만큼만 말합니다."
반드시 지킬 것:
1. 사용자가 준 근거(evidence)에 있는 사실만 씁니다. 근거에 없는 숫자·가격·통화·날짜·제품명·모델 버전·국가·지역·출시 범위·API 제공 여부를 만들지 않습니다.
2. 세 가지를 섞지 않습니다. (A) changes: 공식 발표로 확인된 사실 — 문장마다 근거 id(E0, E1 …). (B) why·impact: AI마중의 해석과 독자 영향 — 근거 범위 안에서만, 시장 전망·추측 수치 금지. (C) unknowns: 아직 확인되지 않은 부분 — 근거에 없는 것을 '확인되지 않았다'고 적습니다.
3. 회사의 주장·자체 평가(최고, 최초, 가장, N배 등)는 "OOO는 …라고 밝혔다"처럼 출처를 밝혀 씁니다.
4. preview·beta·제한 제공과 정식 제공(GA)을 구분합니다. 근거에 없는 한국 출시 여부는 unknowns에 둡니다.
5. '오늘·어제·최근' 같은 상대 날짜 대신 근거의 날짜를 씁니다.
6. AI마중은 이 제품을 직접 써 보지 않았습니다. '직접 써봄', '써 보니', '테스트해 보니' 같은 사용 경험을 절대 쓰지 않습니다.
7. 과장된 제목, 광고성 표현(혁명, 역대급, 게임 체인저, 놓치면 안 될 등), 같은 말 반복을 쓰지 않습니다.
8. 원문 문장을 그대로 번역해 옮기지 말고, 확인한 사실만 새로 씁니다.
9. 근거가 부족하면 "insufficient": true로 답하고 억지로 채우지 않습니다.
출력은 JSON 하나만 (설명 문장·코드 블록 없이).`;

const LENGTH = { SHORT: "본문 약 150~350자", STANDARD: "본문 약 400~800자" };

export function buildPrompt(candidate, evidence, { categories, topics, suggestedDepth }) {
  const ev = evidence.ledger.map((e) => `[${e.id}] (${e.kind}, ${e.source}, ${e.publishedAt?.slice(0, 10) ?? "날짜 없음"}) ${e.text}`).join("\n");
  return `원문: ${candidate.sourceName} — ${candidate.title}
원문 주소: ${candidate.url}
발표일: ${candidate.publishedAt.slice(0, 10)}
기사 유형: ${suggestedDepth} (${LENGTH[suggestedDepth] ?? LENGTH.SHORT}. 글자 수보다 정보 밀도를 우선. 이보다 깊게 쓰지 마세요)

근거:
${ev}

다음 JSON 형식으로 답하세요.
{
  "title": "한국어 제목 (과장 없이, 60자 이내)",
  "summary": "핵심 요약 한두 문장",
  "category": "${categories.join(" | ")} 중 하나",
  "topics": ["다음 중에서만: ${topics.join(", ")}"],
  "companies": ["회사"],
  "products": ["근거에 나온 제품·모델 이름 그대로"],
  "facts": [{ "text": "무엇이 달라졌나 — 공식 발표로 확인된 사실 한 문장", "evidence": ["E1"] }],
  "why": { "text": "왜 중요한가 — AI마중의 해석 (근거 범위 안에서)", "evidence": ["E1"] },
  "change": { "text": "독자에게 미치는 영향 (모르면 모른다고)", "evidence": ["E2"] },
  "checks": [{ "text": "독자가 확인할 사항 (요금제·제공 지역·적용 조건 등)", "evidence": ["E1"] }],
  "unknowns": ["아직 확인되지 않은 부분 (예: 한국 제공 여부·가격이 근거에 없음)"],
  "editorialDepth": "${suggestedDepth === "STANDARD" ? "SHORT 또는 STANDARD" : "SHORT"}",
  "insufficient": false,
  "notes": "편집자가 확인할 점"
}`;
}

/** 응답 텍스트에서 JSON 하나를 꺼낸다 */
export function parseJsonReply(text) {
  const s = String(text ?? "");
  const a = s.indexOf("{");
  const b = s.lastIndexOf("}");
  if (a < 0 || b <= a) throw new SyntaxError("JSON 응답 없음");
  return JSON.parse(s.slice(a, b + 1));
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** 호출 전 상한 확인: 호출 수 · 최악 비용 */
function overBudget(ctx, worstCost) {
  if (ctx.budget.calls >= ctx.limits.maxLlmCalls) return "하루 LLM 호출 상한 도달";
  if (ctx.limits.maxCostUsd != null && ctx.budget.costUsd + worstCost > ctx.limits.maxCostUsd) return `하루 비용 상한($${ctx.limits.maxCostUsd}) — 이번 호출 최악 비용 $${worstCost.toFixed(4)}를 더하면 넘음`;
  return null;
}

async function anthropicProvider(candidate, evidence, ctx) {
  const key = ctx.env.ANTHROPIC_API_KEY;
  if (!key) return { status: "skipped", error: "ANTHROPIC_API_KEY 없음" };
  const cfg = resolveModelConfig(ctx.env);
  if (cfg.error) return { status: "skipped", error: cfg.error, model: cfg.model };
  const prompt = buildPrompt(candidate, evidence, ctx);
  const body = {
    model: cfg.model,
    max_tokens: ctx.limits.maxOutputTokens,
    system: SYSTEM,
    messages: [{ role: "user", content: prompt }],
    output_config: { effort: cfg.effort },
    ...(cfg.thinking ? { thinking: cfg.thinking } : {}),
  };
  const worst = costOf(estimateTokens(SYSTEM + prompt), ctx.limits.maxOutputTokens, cfg);
  const usage = { inputTokens: 0, outputTokens: 0, costUsd: 0, attempts: 0 };
  let lastErr = "unknown";
  for (let attempt = 0; attempt <= ctx.limits.llmRetries; attempt++) {
    const stop = overBudget(ctx, worst);
    if (stop) return { status: attempt ? "failed" : "skipped", error: attempt ? `${lastErr} → ${stop}` : stop, model: cfg.model, usage };
    ctx.budget.calls++;
    usage.attempts++;
    try {
      const res = await (ctx.fetch ?? fetch)("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(ctx.limits.llmTimeoutMs),
      });
      if (!res.ok) {
        lastErr = `HTTP ${res.status}`;
        await res.body?.cancel();
        if (res.status === 429 || res.status >= 500) {
          await wait(ctx.retryDelayMs ?? 2000);
          continue;
        }
        break; // 4xx(키·요청 오류)는 다시 시도하지 않는다
      }
      const json = await res.json();
      const inTok = json.usage?.input_tokens ?? 0;
      const outTok = json.usage?.output_tokens ?? 0;
      const c = costOf(inTok, outTok, cfg);
      usage.inputTokens += inTok;
      usage.outputTokens += outTok;
      usage.costUsd += c;
      ctx.budget.inputTokens += inTok;
      ctx.budget.outputTokens += outTok;
      ctx.budget.costUsd += c;
      if (json.stop_reason === "max_tokens") {
        lastErr = "출력 토큰 상한에서 잘림 (max_tokens)";
        break; // 다시 불러도 같은 상한이라 비용만 든다
      }
      const text = (json.content ?? []).filter((x) => x.type === "text").map((x) => x.text).join("");
      return { status: "ok", draft: parseJsonReply(text), model: cfg.model, usage };
    } catch (e) {
      lastErr = e?.name === "TimeoutError" ? "timeout" : e instanceof SyntaxError ? "JSON 형식 오류" : redact(String(e?.message ?? e), ctx.env).slice(0, 120);
      if (e instanceof SyntaxError) break;
      await wait(ctx.retryDelayMs ?? 2000);
    }
  }
  return { status: "failed", error: redact(lastErr, ctx.env), model: cfg.model, usage };
}

/**
 * Gemini API 무료 등급 (Phase 7.2) — 기본 꺼짐. 다음을 모두 갖춰야만 부른다:
 *   DAILY_LLM_PROVIDER=gemini · GEMINI_API_KEY · DAILY_GEMINI_FREE_TIER_CONFIRMED=true
 * 2026-10-16 확인 (ai.google.dev/gemini-api/docs/pricing): 무료 등급 제공 모델은 아래 목록. 무료 등급에서는 입력 내용이
 *   Google 제품 개선에 쓰인다고 명시돼 있다. 실제 호출 한도(RPM·RPD)는 문서에 숫자가 없고 AI Studio에서만 확인된다 →
 *   한도를 가정하지 않고, 429(한도 초과)를 받으면 그 실행의 나머지 원고는 '작성 대기'로 넘긴다 (재시도로 밀어붙이지 않음).
 * 결제가 연결된 프로젝트의 키면 유료로 청구될 수 있으므로, 무료 등급 프로젝트임을 운영자가 직접 확인하고 표시해야 한다.
 */
export const GEMINI_FREE_MODELS = ["gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-2.5-flash", "gemini-2.5-flash-lite"];
export const GEMINI_DEFAULT_MODEL = "gemini-3.8-flash";
const geminiModel = (env) => String(env.DAILY_GEMINI_MODEL ?? "").trim() || GEMINI_DEFAULT_MODEL;

async function geminiProvider(candidate, evidence, ctx) {
  const key = String(ctx.env.GEMINI_API_KEY ?? "").trim();
  if (!key) return { status: "skipped", error: "GEMINI_API_KEY 없음" };
  const model = geminiModel(ctx.env);
  if (!GEMINI_FREE_MODELS.includes(model)) return { status: "skipped", error: `무료 등급 목록에 없는 모델 ${model}`, model };
  if (ctx.budget.quotaHit) return { status: "skipped", error: "무료 등급 한도(429) — 다음 실행에서 작성", model };
  if (ctx.budget.calls >= ctx.limits.maxLlmCalls) return { status: "skipped", error: "이번 실행 원고 작성 배치 소진 — 다음 실행에서 작성", model };
  const prompt = buildPrompt(candidate, evidence, ctx);
  const usage = { inputTokens: 0, outputTokens: 0, costUsd: 0, attempts: 0 };
  ctx.budget.calls++;
  usage.attempts++;
  try {
    const res = await (ctx.fetch ?? fetch)(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": key, "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", maxOutputTokens: ctx.limits.maxOutputTokens },
      }),
      signal: AbortSignal.timeout(ctx.limits.llmTimeoutMs),
    });
    if (res.status === 429) {
      await res.body?.cancel();
      ctx.budget.quotaHit = true; // 한도: 이 실행에서는 더 부르지 않는다
      return { status: "skipped", error: "무료 등급 한도(429) — 다음 실행에서 작성", model, usage };
    }
    if (!res.ok) {
      await res.body?.cancel();
      return { status: "failed", error: `HTTP ${res.status}`, model, usage };
    }
    const json = await res.json();
    usage.inputTokens = json.usageMetadata?.promptTokenCount ?? 0;
    usage.outputTokens = json.usageMetadata?.candidatesTokenCount ?? 0;
    ctx.budget.inputTokens += usage.inputTokens;
    ctx.budget.outputTokens += usage.outputTokens;
    const c = json.candidates?.[0];
    if (c?.finishReason === "MAX_TOKENS") return { status: "failed", error: "출력 토큰 상한에서 잘림 (MAX_TOKENS)", model, usage };
    const text = (c?.content?.parts ?? []).map((p) => p.text ?? "").join("");
    if (!text.trim()) return { status: "failed", error: `빈 응답 (${c?.finishReason ?? "후보 없음"})`, model, usage };
    return { status: "ok", draft: parseJsonReply(text), model, usage };
  } catch (e) {
    return { status: "failed", error: e?.name === "TimeoutError" ? "timeout" : e instanceof SyntaxError ? "JSON 형식 오류" : redact(String(e?.message ?? e), ctx.env).slice(0, 120), model, usage };
  }
}

/** 시험용: 근거 문장을 옮긴 표시용 원고. 실제 발행 원고가 아니다 (승인 불가) */
async function mockProvider(candidate, evidence, ctx) {
  if (ctx.budget.calls >= ctx.limits.maxLlmCalls) return { status: "skipped", error: "하루 LLM 호출 상한 도달" };
  ctx.budget.calls++;
  const usage = { inputTokens: 0, outputTokens: 0, costUsd: 0, attempts: 1 };
  if (ctx.mockReply) {
    const r = typeof ctx.mockReply === "function" ? await ctx.mockReply(candidate, evidence, ctx) : ctx.mockReply;
    if (r instanceof Error) return { status: "failed", error: redact(r.message, ctx.env), model: "mock", usage };
    return { status: "ok", draft: r, model: "mock", usage };
  }
  const body = evidence.ledger.filter((e) => e.kind === "body");
  const use = (body.length ? body : evidence.ledger).slice(0, 3);
  return {
    status: "ok",
    model: "mock",
    usage,
    draft: {
      title: `[MOCK] ${candidate.title}`.slice(0, 80),
      summary: use[0]?.text ?? candidate.title,
      category: "PRODUCT_UPDATE",
      topics: [],
      companies: [candidate.sourceName],
      products: [],
      facts: use.map((e) => ({ text: e.text, evidence: [e.id] })),
      why: { text: use[0]?.text ?? "", evidence: use[0] ? [use[0].id] : [] },
      change: { text: use.at(-1)?.text ?? "", evidence: use.at(-1) ? [use.at(-1).id] : [] },
      checks: use[0] ? [{ text: use[0].text, evidence: [use[0].id] }] : [],
      unknowns: ["mock 원고 — 사람이 작성·확인해야 함"],
      editorialDepth: "SHORT",
      insufficient: false,
      notes: "mock provider — 승인 불가",
    },
  };
}

export const PROVIDERS = { anthropic: anthropicProvider, gemini: geminiProvider, mock: mockProvider };

/** DAILY_LLM_PROVIDER가 없으면: 키가 있으면 anthropic, 없으면 none */
export function resolveProvider(env = process.env) {
  const p = String(env.DAILY_LLM_PROVIDER ?? "").trim().toLowerCase();
  if (p === "none" || p === "off") return "none";
  if (p && PROVIDERS[p]) return p;
  return env.ANTHROPIC_API_KEY ? "anthropic" : "none";
}

/**
 * 실행 전에 공급자가 실제로 쓸 수 있는지 (draft 모드 시작 시 한 번 확인 — 안 되면 LLM 호출 없이 안내)
 * @returns {string|null} 쓸 수 없는 이유
 */
export function providerBlocker(provider, env = process.env) {
  if (provider === "none") return "원고 생성 공급자가 none — DAILY_LLM_PROVIDER=anthropic(또는 시험용 mock)이 필요";
  if (provider === "gemini") {
    if (!String(env.GEMINI_API_KEY ?? "").trim()) return "GEMINI_API_KEY가 설정되지 않음 — 무료 원고 생성을 쓰려면 Google AI Studio 키 필요 (지금은 원고 작성 대기)";
    if (String(env.DAILY_GEMINI_FREE_TIER_CONFIRMED ?? "").trim() !== "true") return "DAILY_GEMINI_FREE_TIER_CONFIRMED=true가 아님 — 결제가 연결되지 않은 무료 등급 프로젝트인지 운영자가 확인해야 함 (무료 등급은 입력이 Google 제품 개선에 쓰임)";
    if (!GEMINI_FREE_MODELS.includes(geminiModel(env))) return `무료 등급 목록에 없는 모델 ${geminiModel(env)}`;
  }
  if (provider === "anthropic") {
    if (!String(env.ANTHROPIC_API_KEY ?? "").trim()) return "ANTHROPIC_API_KEY가 설정되지 않음 — GitHub Secret 또는 .env.local에 넣은 뒤 다시 실행 (지금은 원고를 만들지 않음)";
    const cfg = resolveModelConfig(env);
    if (cfg.error) return cfg.error;
  }
  return null;
}

export async function generateArticle(candidate, evidence, ctx) {
  const name = ctx.provider;
  if (name === "none" || !PROVIDERS[name]) return { status: "skipped", error: "원고 생성 공급자 없음 (API 키 미설정)", provider: "none" };
  try {
    const r = await PROVIDERS[name](candidate, evidence, ctx);
    return { ...r, provider: name };
  } catch (e) {
    // 한 후보의 예외가 다른 후보 처리를 멈추지 않게
    return { status: "failed", error: redact(String(e?.message ?? e), ctx.env).slice(0, 160), provider: name };
  }
}
