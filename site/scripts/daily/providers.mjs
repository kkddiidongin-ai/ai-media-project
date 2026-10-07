/**
 * 원고 생성 공급자 (provider) — 특정 회사 API에 묶이지 않게 한 겹 둔다.
 *
 *   generateArticle(candidate, evidence, ctx) → { status, draft?, usage?, error? }
 *
 * 공급자 (DAILY_LLM_PROVIDER):
 *   none       키가 없거나 생성을 끈 상태. 생성하지 않고 'skipped'로 보고한다 (가짜 원고를 만들지 않는다)
 *   mock       시험용. 근거 문장을 그대로 옮긴 표시용 원고 — 승인 불가 (provider: mock)
 *   anthropic  Anthropic Messages API (ANTHROPIC_API_KEY, DAILY_LLM_MODEL)
 * 새 공급자는 PROVIDERS에 같은 모양의 함수를 더하면 된다.
 *
 * 비용 상한: ctx.budget.calls가 maxLlmCalls를 넘으면 호출하지 않는다. 실패는 llmRetries번까지만 다시 시도한다.
 * 키 값은 어디에도 출력하지 않는다.
 */

const SYSTEM = `당신은 한국어 AI 뉴스 미디어 'AI마중'의 편집 보조입니다. 원칙: "AI, 해본 만큼만 말합니다."
반드시 지킬 것:
1. 사용자가 준 근거(evidence)에 있는 사실만 씁니다. 근거에 없는 숫자·가격·날짜·제품명·국가·출시 범위를 만들지 않습니다.
2. 모든 fact에는 근거 id(E0, E1 …)를 붙입니다. 근거가 부족하면 "insufficient": true로 답하고 억지로 채우지 않습니다.
3. 회사의 주장·자체 평가(최고, 최초, 가장 등)는 "OOO는 …라고 밝혔다"처럼 출처를 밝혀 씁니다.
4. preview·beta·제한 제공과 정식 제공(GA)을 구분합니다. 근거에 없는 한국 출시 여부는 쓰지 않습니다.
5. '오늘·어제·최근' 같은 상대 날짜 대신 근거의 날짜를 씁니다.
6. 원문 문장을 그대로 번역해 옮기지 말고, 확인한 사실만 새로 씁니다.
7. editorialDepth는 근거가 허락하는 만큼만: 근거 문장이 적으면 SHORT. STANDARD는 변화·이전 맥락·조건·사용자 영향을 근거로 설명할 수 있을 때만.
출력은 JSON 하나만 (설명 문장 없이).`;

export function buildPrompt(candidate, evidence, { categories, topics, suggestedDepth }) {
  const ev = evidence.ledger.map((e) => `[${e.id}] (${e.kind}, ${e.source}, ${e.publishedAt?.slice(0, 10) ?? "날짜 없음"}) ${e.text}`).join("\n");
  return `원문: ${candidate.sourceName} — ${candidate.title}
원문 주소: ${candidate.url}
발표일: ${candidate.publishedAt.slice(0, 10)}
근거로 판단한 최대 깊이: ${suggestedDepth} (이보다 깊게 쓰지 마세요)

근거:
${ev}

다음 JSON 형식으로 답하세요.
{
  "title": "한국어 제목 (과장 없이, 60자 이내)",
  "summary": "한두 문장 요약",
  "category": "${categories.join(" | ")} 중 하나",
  "topics": ["다음 중에서만: ${topics.join(", ")}"],
  "companies": ["회사"],
  "products": ["제품"],
  "facts": [{ "text": "사실 한 문장", "evidence": ["E1"] }],
  "why": { "text": "왜 중요한가 (근거 범위 안에서)", "evidence": ["E1"] },
  "change": { "text": "그래서 사용자에게 무엇이 달라지나 (모르면 모른다고)", "evidence": ["E2"] },
  "editorialDepth": "SHORT 또는 STANDARD",
  "insufficient": false,
  "notes": "편집자가 확인할 점"
}`;
}

/** 응답 텍스트에서 JSON 하나를 꺼낸다 */
export function parseJsonReply(text) {
  const s = String(text ?? "");
  const a = s.indexOf("{");
  const b = s.lastIndexOf("}");
  if (a < 0 || b <= a) throw new Error("JSON 응답 없음");
  return JSON.parse(s.slice(a, b + 1));
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function anthropicProvider(candidate, evidence, ctx) {
  const key = ctx.env.ANTHROPIC_API_KEY;
  if (!key) return { status: "skipped", error: "ANTHROPIC_API_KEY 없음" };
  const model = ctx.env.DAILY_LLM_MODEL || "claude-sonnet-5-5";
  const body = {
    model,
    max_tokens: ctx.limits.maxOutputTokens,
    system: SYSTEM,
    messages: [{ role: "user", content: buildPrompt(candidate, evidence, ctx) }],
  };
  let lastErr = "unknown";
  for (let attempt = 0; attempt <= ctx.limits.llmRetries; attempt++) {
    if (ctx.budget.calls >= ctx.limits.maxLlmCalls) return { status: "skipped", error: "하루 LLM 호출 상한 도달" };
    ctx.budget.calls++;
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
      ctx.budget.inputTokens += json.usage?.input_tokens ?? 0;
      ctx.budget.outputTokens += json.usage?.output_tokens ?? 0;
      const text = (json.content ?? []).filter((c) => c.type === "text").map((c) => c.text).join("");
      return { status: "ok", draft: parseJsonReply(text), model };
    } catch (e) {
      lastErr = e?.name === "TimeoutError" ? "timeout" : e instanceof SyntaxError ? "JSON 형식 오류" : String(e?.message ?? e).slice(0, 120);
      if (e instanceof SyntaxError) break;
      await wait(ctx.retryDelayMs ?? 2000);
    }
  }
  return { status: "failed", error: lastErr, model };
}

/** 시험용: 근거 문장을 그대로 옮긴 표시용 원고. 실제 발행 원고가 아니다 */
async function mockProvider(candidate, evidence, ctx) {
  if (ctx.budget.calls >= ctx.limits.maxLlmCalls) return { status: "skipped", error: "하루 LLM 호출 상한 도달" };
  ctx.budget.calls++;
  if (ctx.mockReply) return { status: "ok", draft: typeof ctx.mockReply === "function" ? ctx.mockReply(candidate, evidence) : ctx.mockReply, model: "mock" };
  const body = evidence.ledger.filter((e) => e.kind === "body");
  const use = (body.length ? body : evidence.ledger).slice(0, 3);
  return {
    status: "ok",
    model: "mock",
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
      editorialDepth: "SHORT",
      insufficient: false,
      notes: "mock provider — 승인 불가",
    },
  };
}

export const PROVIDERS = { anthropic: anthropicProvider, mock: mockProvider };

/** DAILY_LLM_PROVIDER가 없으면: 키가 있으면 anthropic, 없으면 none */
export function resolveProvider(env = process.env) {
  const p = String(env.DAILY_LLM_PROVIDER ?? "").trim().toLowerCase();
  if (p === "none" || p === "off") return "none";
  if (p && PROVIDERS[p]) return p;
  return env.ANTHROPIC_API_KEY ? "anthropic" : "none";
}

export async function generateArticle(candidate, evidence, ctx) {
  const name = ctx.provider;
  if (name === "none" || !PROVIDERS[name]) return { status: "skipped", error: "원고 생성 공급자 없음 (API 키 미설정)", provider: "none" };
  const r = await PROVIDERS[name](candidate, evidence, ctx);
  return { ...r, provider: name };
}
