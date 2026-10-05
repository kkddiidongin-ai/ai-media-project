import fs from "node:fs";
import path from "node:path";
import { categoryLabels } from "@/config/labels";

/**
 * AI MEDIA 로컬 콘텐츠 DB (Phase 6.3)
 *
 * INGEST(scripts/ingest) → content/ (로컬 DB) → BUILD
 * 빌드는 이 파일로 content/ 만 읽는다. 외부 사이트에 접속하지 않는다.
 * 형식이 틀리면 빌드를 멈춘다.
 */

const CONTENT = path.join(process.cwd(), "content");

export type Category = keyof typeof categoryLabels;
/** NEWS: 외부 공식 발표 기반 기사. TEST/TRACK/CHECK/BRIEF/GUIDE: 향후 AI MEDIA가 직접 만든 콘텐츠용 (Phase 6 철학 보존) */
export type ContentType = "NEWS" | "TEST" | "TRACK" | "CHECK" | "BRIEF" | "GUIDE";

export interface SourceRef {
  candidateId?: string;
  sourceType: "official" | "press";
  sourceName: string;
  sourceUrl: string;
  sourcePublishedAt: string;
  sourceTitle: string;
}

export interface Story extends SourceRef {
  id: string;
  slug: string;
  title: string;
  summary: string;
  category: Category;
  topics: string[];
  companies: string[];
  products: string[];
  facts: string[];
  whyItMatters: string;
  whatChanges: string;
  priority: number;
  secondarySources: SourceRef[];
  eventDate: string;
  publishedAt: string;
  updatedAt: string;
  contentType: ContentType;
  status: "published";
  backfilled: boolean;
  collectedAt: string;
  provenance: { discoveredVia: string; fetchMode: string; runId: string; verification: "primary-official" | "primary+secondary" | "press-only" };
  /** 내부 편집 등급(화면에 표시하지 않음). deep만 lead·sections를 가지며, 없으면 기존 형식으로 보여준다 */
  editorialDepth?: "deep" | "standard" | "short";
  lead?: string;
  sections?: StorySection[];
  /** 원문·추가 출처 외에 편집자가 확인한 공식 자료 */
  references?: StoryReference[];
}

/** 심층 기사 본문 한 덩어리. role은 정보 역할, heading은 기사마다 자연스럽게 쓴 제목 */
export interface StorySection {
  role: "what" | "before" | "change" | "point" | "users" | "open";
  heading: string;
  paragraphs: string[];
  bullets: string[];
}

export interface StoryReference {
  sourceName: string;
  sourceTitle: string;
  sourceUrl: string;
  sourcePublishedAt: string;
  checkedAt: string;
  note: string;
}

export interface Topic {
  slug: string;
  name: string;
  kind: "company" | "product" | "theme";
  description: string;
  /** 검색용 다른 이름 (한글·영문 표기, 약칭) */
  aliases?: string[];
}

export interface Issue {
  /** YYYY-MM-DD (사건 발생일) */
  date: string;
  stories: Story[];
  /** 이 사이트가 실제로 정리한 날 (소급 정리면 date보다 뒤) */
  compiledAt: string;
  backfilled: boolean;
}

export interface ChartItem {
  label?: string;
  group?: string;
  value?: number;
  display?: string;
  note?: string;
  date?: string;
  storySlug?: string;
  sourceName?: string;
  sourceUrl?: string;
}

export interface Chart {
  slug: string;
  publishedAt: string;
  checkedAt: string;
  category: string;
  title: string;
  summary: string;
  point: string;
  type: "bar" | "timeline" | "list" | "db-monthly";
  unit: string;
  basis: string;
  topics: string[];
  items: ChartItem[];
  sources: { name: string; url: string }[];
  relatedStories: string[];
  /** 심층 해설(Phase 6.4.1 Pilot)에만 있는 선택 필드 */
  oneLine?: string;
  analysis?: ChartSection[];
}

/** 차트 해설 한 덩어리: 무엇을 비교하나 · 숫자에서 보이는 것 · 왜 · 해석할 때 · 주의 */
export interface ChartSection {
  role: "compare" | "see" | "why" | "read" | "caution";
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
}

export interface CardSlide {
  kicker: string;
  title: string;
  body: string;
}

export interface Cardnews {
  slug: string;
  publishedAt: string;
  demo: boolean;
  title: string;
  summary: string;
  topics: string[];
  storySlugs: string[];
  slides: CardSlide[];
}

/**
 * AI톡 데이터 모델 (Phase 6.3: 모델만 정의, 백엔드·게시글 없음).
 * 한 토론은 하나의 실제 기사(storySlug)에서 출발한다. 참여자는 사람 또는 AI이며,
 * AI 참여자는 실제로 그 모델이 생성한 글에만 model을 표기한다 (사람이 쓴 글에 "GPT 작성" 등 표기 금지).
 */
export interface TalkThread {
  id: string;
  storySlug: string;
  status: "planned" | "open" | "closed";
  createdAt: string;
  posts: TalkPost[];
}
export interface TalkPost {
  id: string;
  author: { kind: "human"; displayName: string } | { kind: "ai"; model: string; operator: string };
  /** 답글·반론 대상 */
  replyTo?: string;
  role: "opinion" | "review" | "rebuttal" | "answer" | "comment";
  body: string;
  createdAt: string;
}

class ContentError extends Error {}
const fail = (where: string, msg: string): never => {
  throw new ContentError(`[content] ${where}: ${msg}`);
};

function readJsonDir<T>(dir: string): { file: string; data: T }[] {
  const full = path.join(CONTENT, dir);
  if (!fs.existsSync(full)) return [];
  return fs
    .readdirSync(full)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => ({ file: `${dir}/${f}`, data: JSON.parse(fs.readFileSync(path.join(full, f), "utf8")) as T }));
}

const isDate = (s: unknown) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}/.test(s);
const isUrl = (s: unknown) => typeof s === "string" && /^https?:\/\//.test(s);

// ---------- topics ----------

let topicCache: Topic[] | null = null;
export function getTopics(): Topic[] {
  if (topicCache) return topicCache;
  const list = JSON.parse(fs.readFileSync(path.join(CONTENT, "topics.json"), "utf8")) as Topic[];
  const seen = new Set<string>();
  for (const t of list) {
    if (!/^[a-z0-9-]+$/.test(t.slug)) fail("topics.json", `slug ${t.slug}`);
    if (seen.has(t.slug)) fail("topics.json", `slug 중복 ${t.slug}`);
    seen.add(t.slug);
  }
  topicCache = list;
  return list;
}
export const getTopic = (slug: string) => getTopics().find((t) => t.slug === slug);

// ---------- stories ----------

let storyCache: Story[] | null = null;
export function getStories(): Story[] {
  if (storyCache) return storyCache;
  const topics = new Set(getTopics().map((t) => t.slug));
  const slugs = new Set<string>();
  const urls = new Map<string, string>();
  const out: Story[] = [];
  for (const { file, data } of readJsonDir<Story[]>("stories")) {
    for (const s of data) {
      const where = `${file} ${s.slug}`;
      for (const k of ["id", "slug", "title", "summary", "category", "whyItMatters", "whatChanges", "sourceName", "sourceTitle"] as const)
        if (!s[k]) fail(where, `${k} 필요`);
      if (!Array.isArray(s.facts) || s.facts.length === 0) fail(where, "facts 필요");
      if (!(s.category in categoryLabels)) fail(where, `category ${s.category}`);
      if (!isDate(s.eventDate) || !isDate(s.publishedAt)) fail(where, "날짜 형식");
      if (!isUrl(s.sourceUrl)) fail(where, "sourceUrl 형식");
      for (const x of s.secondarySources) if (!isUrl(x.sourceUrl)) fail(where, "secondary sourceUrl 형식");
      for (const t of s.topics) if (!topics.has(t)) fail(where, `topic ${t} 없음`);
      if (s.editorialDepth === "deep") {
        if (!s.lead || !s.sections?.length) fail(where, "심층 기사에 lead·sections 필요");
        for (const r of s.references ?? []) if (!isUrl(r.sourceUrl) || !isDate(r.checkedAt)) fail(where, "reference URL·확인일 형식");
      }
      if (slugs.has(s.slug)) fail(where, "slug 중복");
      slugs.add(s.slug);
      if (urls.has(s.sourceUrl)) fail(where, `같은 원문(${s.sourceUrl})이 ${urls.get(s.sourceUrl)}에도 있음`);
      urls.set(s.sourceUrl, s.slug);
      out.push(s);
    }
  }
  storyCache = out.sort((a, b) => b.eventDate.localeCompare(a.eventDate) || a.priority - b.priority || a.slug.localeCompare(b.slug));
  return storyCache;
}
export const getStory = (slug: string) => getStories().find((s) => s.slug === slug);
export const storiesForTopic = (slug: string) => getStories().filter((s) => s.topics.includes(slug));

// ---------- newsletter issues (사건 발생일 기준 묶음) ----------

let issueCache: Issue[] | null = null;
export function getIssues(): Issue[] {
  if (issueCache) return issueCache;
  const map = new Map<string, Story[]>();
  for (const s of getStories()) {
    if (!map.has(s.eventDate)) map.set(s.eventDate, []);
    map.get(s.eventDate)!.push(s);
  }
  issueCache = [...map.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, stories]) => {
      const compiledAt = stories.map((s) => s.publishedAt).sort()[0];
      return { date, stories, compiledAt, backfilled: stories.some((s) => s.backfilled) };
    });
  return issueCache;
}
export const getIssue = (date: string) => getIssues().find((i) => i.date === date);
export const issueOfStory = (s: Story) => getIssue(s.eventDate);

// ---------- charts ----------

let chartCache: Chart[] | null = null;
export function getCharts(): Chart[] {
  if (chartCache) return chartCache;
  const stories = new Set(getStories().map((s) => s.slug));
  const out: Chart[] = [];
  for (const { file, data: c } of readJsonDir<Chart>("charts")) {
    if (!c.slug || !c.title || !c.point) fail(file, "slug·title·point 필요");
    if (!isDate(c.checkedAt) || !isDate(c.publishedAt)) fail(file, "checkedAt·publishedAt 필요 (가짜 차트 방지)");
    if (!c.sources?.length) fail(file, "sources 필요");
    if (!c.basis) fail(file, "basis(비교 기준) 필요");
    for (const it of c.items) {
      if (it.storySlug && !stories.has(it.storySlug)) fail(file, `연결 기사 ${it.storySlug} 없음`);
      if (c.type === "bar" && typeof it.value !== "number") fail(file, `막대 값 없음 (${it.label})`);
      if (c.type === "bar" && !it.storySlug && !it.sourceUrl) fail(file, `막대 항목 출처 없음 (${it.label})`);
    }
    for (const r of c.relatedStories) if (!stories.has(r)) fail(file, `relatedStories ${r} 없음`);
    out.push(c);
  }
  chartCache = out.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  return chartCache;
}
export const getChart = (slug: string) => getCharts().find((c) => c.slug === slug);

/** 차트 날짜 묶음 (Reference: 날짜별 차트) */
export function getChartDays() {
  const map = new Map<string, Chart[]>();
  for (const c of getCharts()) {
    if (!map.has(c.publishedAt)) map.set(c.publishedAt, []);
    map.get(c.publishedAt)!.push(c);
  }
  return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([date, charts]) => ({ date, charts }));
}

// ---------- cardnews ----------

let cardCache: Cardnews[] | null = null;
export function getCardnews(): Cardnews[] {
  if (cardCache) return cardCache;
  const stories = new Set(getStories().map((s) => s.slug));
  const out: Cardnews[] = [];
  for (const { file, data: c } of readJsonDir<Cardnews>("cardnews")) {
    if (!c.slides?.length) fail(file, "slides 필요");
    for (const s of c.storySlugs) if (!stories.has(s)) fail(file, `원천 기사 ${s} 없음`);
    if (c.storySlugs.length === 0) fail(file, "원천 기사 필요 (가짜 카드뉴스 방지)");
    out.push(c);
  }
  cardCache = out.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.slug.localeCompare(b.slug));
  return cardCache;
}
export const getCard = (slug: string) => getCardnews().find((c) => c.slug === slug);

// ---------- 통계 ----------

export function monthlyCounts() {
  const m = new Map<string, number>();
  for (const s of getStories()) m.set(s.eventDate.slice(0, 7), (m.get(s.eventDate.slice(0, 7)) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

export function topicCounts() {
  return getTopics()
    .map((t) => {
      const list = storiesForTopic(t.slug);
      return { topic: t, count: list.length, latest: list[0]?.eventDate ?? null };
    })
    .sort((a, b) => b.count - a.count);
}

// ---------- 주제 지식 아카이브 (Phase 6.4) ----------

/** 최근 핵심 기사: 우선순위 1~2 중 가장 최근, 없으면 가장 최근 기사 */
export function latestKeyStory(slug: string): Story | undefined {
  const list = storiesForTopic(slug);
  return list.find((s) => s.priority <= 2) ?? list[0];
}

/** 2026 핵심 변화: 월마다 가장 중요한(우선순위 낮은 숫자 → 최근) 기사 1건, 시간순 */
export function keyChanges(slug: string): Story[] {
  const byMonth = new Map<string, Story>();
  for (const s of storiesForTopic(slug)) {
    const m = s.eventDate.slice(0, 7);
    const cur = byMonth.get(m);
    if (!cur || s.priority < cur.priority) byMonth.set(m, s);
  }
  return [...byMonth.values()].sort((a, b) => a.eventDate.localeCompare(b.eventDate));
}

/**
 * 처음 보는 사람이라면: 규칙 기반 3~5건.
 * 우선순위 1 → 2 → 3 순으로, 같은 우선순위 안에서는 최근 기사부터,
 * 분류(category)가 겹치지 않게 고른다. 5건을 못 채우면 분류 제한 없이 채운다.
 */
export function starterStories(slug: string, max = 5): Story[] {
  const list = [...storiesForTopic(slug)].sort((a, b) => a.priority - b.priority || b.eventDate.localeCompare(a.eventDate));
  const out: Story[] = [];
  const cats = new Set<string>();
  for (const s of list) {
    if (out.length >= max) break;
    if (cats.has(s.category)) continue;
    cats.add(s.category);
    out.push(s);
  }
  for (const s of list) {
    if (out.length >= Math.min(max, list.length) || out.length >= 3) break;
    if (!out.includes(s)) out.push(s);
  }
  return out.sort((a, b) => a.eventDate.localeCompare(b.eventDate));
}

/** 함께 자주 등장한 주제 (같은 기사에 함께 붙은 횟수) */
export function relatedTopics(slug: string, max = 6): { topic: Topic; count: number }[] {
  const m = new Map<string, number>();
  for (const s of storiesForTopic(slug)) for (const t of s.topics) if (t !== slug) m.set(t, (m.get(t) ?? 0) + 1);
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, max)
    .map(([t, count]) => ({ topic: getTopic(t)!, count }))
    .filter((x) => x.topic);
}
