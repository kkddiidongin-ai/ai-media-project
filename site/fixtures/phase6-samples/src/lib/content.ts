import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { marked } from "marked";
import {
  disclosureLabels,
  effectLabels,
  formatLabels,
  relationLabels,
  taskGroupLabels,
  verdictLabels,
  verificationLabels,
  versionTypeLabels,
} from "@/config/labels";
import type {
  Article,
  ArticleMeta,
  Correction,
  Status,
  Task,
  VersionEntry,
  WeeklyIssue,
} from "./types";

/**
 * 콘텐츠는 site/content/ 아래의 Markdown·JSON 파일로 관리한다.
 * 빌드 시점에 읽기만 하며, 형식이 틀리면 빌드를 멈춰 잘못된 글이 발행되지 않게 한다.
 */
const CONTENT_DIR = path.join(process.cwd(), "content");

const STATUSES: Status[] = ["idea", "in_progress", "published", "tracking", "needs_check", "archived"];
const FRESHNESS = ["FAST", "MEDIUM", "SLOW"];

class ContentError extends Error {}

function fail(file: string, msg: string): never {
  throw new ContentError(`[content] ${file}: ${msg}`);
}

function readMarkdownDir(dir: string) {
  const full = path.join(CONTENT_DIR, dir);
  if (!fs.existsSync(full)) return [];
  return fs
    .readdirSync(full)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const raw = fs.readFileSync(path.join(full, f), "utf8");
      const { data, content } = matter(raw);
      return { file: `${dir}/${f}`, data: data as Record<string, unknown>, body: content };
    });
}

function toDate(v: unknown): string | null {
  if (v === undefined || v === null || v === "") return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v);
}

function asArray<T = unknown>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function oneOf<T extends string>(file: string, field: string, v: unknown, allowed: readonly T[], optional = false): T | null {
  if (v === undefined || v === null || v === "") {
    if (optional) return null;
    fail(file, `"${field}"가 비어 있습니다`);
  }
  if (!allowed.includes(v as T)) fail(file, `"${field}" 값 "${String(v)}"은(는) 허용되지 않습니다 (${allowed.join(", ")})`);
  return v as T;
}

function requireString(file: string, field: string, v: unknown): string {
  if (typeof v !== "string" || v.trim() === "") fail(file, `"${field}"가 필요합니다`);
  return v;
}

function renderMarkdown(body: string): string {
  return marked.parse(body, { async: false, gfm: true }) as string;
}

// ---------- 과제 ----------

let taskCache: Task[] | null = null;

export function getTasks(): Task[] {
  if (taskCache) return taskCache;
  const tasks = readMarkdownDir("tasks").map(({ file, data }) => {
    const t: Task = {
      slug: requireString(file, "slug", data.slug),
      name: requireString(file, "name", data.name),
      group: oneOf(file, "group", data.group, Object.keys(taskGroupLabels) as Task["group"][])!,
      order: Number(data.order ?? 99),
      description: requireString(file, "description", data.description),
      featured: asArray<string>(data.featured),
      nextChecks: asArray<string>(data.nextChecks),
      note: (data.note as string) ?? null,
    };
    return t;
  });
  taskCache = tasks.sort((a, b) => a.order - b.order);
  return taskCache;
}

export function getTask(slug: string): Task | undefined {
  return getTasks().find((t) => t.slug === slug);
}

// ---------- 글 ----------

let articleCache: Article[] | null = null;

export function getArticles(): Article[] {
  if (articleCache) return articleCache;
  const taskSlugs = new Set(getTasks().map((t) => t.slug));
  const articles = readMarkdownDir("articles").map(({ file, data, body }) => {
    const format = oneOf(file, "format", data.format, Object.keys(formatLabels) as ArticleMeta["format"][])!;
    const task = requireString(file, "task", data.task);
    if (!taskSlugs.has(task)) fail(file, `과제 "${task}"가 content/tasks에 없습니다`);

    const versions = asArray<Record<string, unknown>>(data.versions).map<VersionEntry>((v) => ({
      date: toDate(v.date) ?? fail(file, "versions.date가 필요합니다"),
      type: oneOf(file, "versions.type", v.type, Object.keys(versionTypeLabels) as VersionEntry["type"][])!,
      note: requireString(file, "versions.note", v.note),
      verdictFrom: (v.verdictFrom as VersionEntry["verdictFrom"]) ?? undefined,
      verdictTo: (v.verdictTo as VersionEntry["verdictTo"]) ?? undefined,
    }));

    const meta: ArticleMeta = {
      id: requireString(file, "id", data.id),
      slug: requireString(file, "slug", data.slug),
      title: requireString(file, "title", data.title),
      summary: requireString(file, "summary", data.summary),
      task,
      format,
      verificationMethod: oneOf(file, "verificationMethod", data.verificationMethod, Object.keys(verificationLabels) as NonNullable<ArticleMeta["verificationMethod"]>[], true),
      verdict: oneOf(file, "verdict", data.verdict, Object.keys(verdictLabels) as NonNullable<ArticleMeta["verdict"]>[], true),
      effects: asArray<string>(data.effects).map((e) => oneOf(file, "effects", e, Object.keys(effectLabels) as ArticleMeta["effects"])!),
      keyResults: asArray<{ label: string; value: string }>(data.keyResults).slice(0, 3),
      tools: asArray<string>(data.tools),
      conditions: (data.conditions as string) ?? null,
      checkedAt: toDate(data.checkedAt),
      publishedAt: toDate(data.publishedAt),
      updatedAt: toDate(data.updatedAt),
      freshness: oneOf(file, "freshness", data.freshness ?? "MEDIUM", FRESHNESS as ArticleMeta["freshness"][])!,
      status: oneOf(file, "status", data.status, STATUSES)!,
      nextCheckAt: toDate(data.nextCheckAt),
      disclosure: oneOf(file, "disclosure", data.disclosure ?? "none", Object.keys(disclosureLabels) as ArticleMeta["disclosure"][])!,
      aiUse: (data.aiUse as string) ?? null,
      fitFor: asArray<string>(data.fitFor),
      notFor: asArray<string>(data.notFor),
      nextQuestions: asArray<string>(data.nextQuestions),
      related: asArray<Record<string, unknown>>(data.related).slice(0, 3).map((r) => ({
        slug: requireString(file, "related.slug", r.slug),
        type: oneOf(file, "related.type", r.type, Object.keys(relationLabels) as ArticleMeta["related"][number]["type"][])!,
        reason: requireString(file, "related.reason", r.reason),
      })),
      versions,
      track: data.track
        ? {
            days: Number((data.track as Record<string, unknown>).days ?? 30),
            startedAt: toDate((data.track as Record<string, unknown>).startedAt),
            nextUpdateAt: toDate((data.track as Record<string, unknown>).nextUpdateAt),
          }
        : null,
      claim: data.claim
        ? {
            text: requireString(file, "claim.text", (data.claim as Record<string, unknown>).text),
            source: requireString(file, "claim.source", (data.claim as Record<string, unknown>).source),
            sourceUrl: ((data.claim as Record<string, unknown>).sourceUrl as string) ?? undefined,
            checkedAt: toDate((data.claim as Record<string, unknown>).checkedAt) ?? undefined,
          }
        : null,
      sample: data.sample === true,
    };

    // 예시 글이 결론·수치를 가지면 실제 결과처럼 보일 수 있으므로 빌드에서 막는다.
    if (meta.sample && (meta.verdict || meta.keyResults.length > 0)) {
      fail(file, "sample 글에는 verdict나 keyResults를 넣을 수 없습니다 (실제 결과처럼 보이지 않게)");
    }
    return { ...meta, html: renderMarkdown(body) };
  });

  const slugs = new Set<string>();
  for (const a of articles) {
    if (slugs.has(a.slug)) throw new ContentError(`[content] slug 중복: ${a.slug}`);
    slugs.add(a.slug);
  }
  for (const a of articles) {
    for (const r of a.related) {
      if (!slugs.has(r.slug)) throw new ContentError(`[content] ${a.slug}: 연결된 글 "${r.slug}"가 없습니다`);
    }
  }

  articleCache = articles
    .filter((a) => a.status !== "idea" && a.status !== "in_progress")
    .sort((a, b) => sortDate(b) - sortDate(a));
  return articleCache;
}

function sortDate(a: ArticleMeta): number {
  const d = a.checkedAt ?? a.updatedAt ?? a.publishedAt;
  return d ? Date.parse(d) : 0;
}

export function getArticle(slug: string): Article | undefined {
  return getArticles().find((a) => a.slug === slug);
}

export function getArticlesByTask(taskSlug: string): Article[] {
  return getArticles().filter((a) => a.task === taskSlug);
}

/** TRACK이면서 진행 중인 글 */
export function isTracking(a: ArticleMeta) {
  return a.format === "TRACK" && a.status === "tracking";
}

// ---------- 주간 노트 ----------

let weeklyCache: WeeklyIssue[] | null = null;

type RawItem = { text?: unknown; slug?: unknown };
function items(v: unknown) {
  return asArray<RawItem>(v).map((i) => ({ text: String(i.text ?? ""), slug: i.slug ? String(i.slug) : undefined }));
}

export function getWeeklyIssues(): WeeklyIssue[] {
  if (weeklyCache) return weeklyCache;
  weeklyCache = readMarkdownDir("weekly")
    .map(({ file, data, body }) => ({
      slug: requireString(file, "slug", data.slug),
      issue: Number(data.issue ?? 0),
      date: toDate(data.date) ?? fail(file, "date가 필요합니다"),
      title: requireString(file, "title", data.title),
      sample: data.sample === true,
      changes: items(data.changes),
      checked: items(data.checked),
      tryThis: data.tryThis ? items([data.tryThis])[0] : null,
      tracking: items(data.tracking),
      updates: items(data.updates),
      html: renderMarkdown(body),
    }))
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  return weeklyCache;
}

export function getWeeklyIssue(slug: string) {
  return getWeeklyIssues().find((w) => w.slug === slug);
}

// ---------- 정정 기록 ----------

export function getCorrections(): Correction[] {
  const file = path.join(CONTENT_DIR, "corrections.json");
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, "utf8")) as Correction[];
}
