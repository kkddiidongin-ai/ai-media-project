#!/usr/bin/env node
/**
 * 승인된 원고 발행 · 배포 · 운영 URL 확인 (Phase 7.2) — 기존 수동 절차(DAILY_PUBLISHING.md)와 같은 명령을 차례로 부른다
 *
 *   node scripts/pipeline/publish.mjs publish --drafts <editorial-drafts.json> --approved-by <이름> [--only a,b] [--mode manual|auto]
 *       daily:apply-drafts --apply → npm run publish:daily(publish:stories → qa:content → tsc → lint → build → qa:routes)
 *       하나라도 실패하면 이번에 바꾼 ingest 파일을 원래대로 되돌린다. 기사 기록: ingest/publications.json
 *   node scripts/pipeline/publish.mjs deploy      VERCEL_DEPLOY_ENABLED=true + VERCEL_TOKEN일 때만 Production 배포 (기본 꺼짐)
 *   node scripts/pipeline/publish.mjs verify      배포된 기사 URL이 운영 사이트에서 열리는지 확인 (실제 발행 여부 추적)
 *
 * git commit·push는 이 스크립트가 하지 않는다 (workflow 또는 사람이 한다).
 * '발행 승인' = 사람이 보호된 발행 workflow를 실행(또는 이 명령을 직접 실행)한 것. 자동 발행은 AUTO_PUBLISH_ENABLED로만 켜진다.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ROOT, readJson } from "../ingest/lib.mjs";
import { buildPackage, writePackage } from "../daily/apply-editorial-package.mjs";

export const PUBLICATIONS_FILE = path.join(ROOT, "ingest", "publications.json");
const SITE_URL = "https://aimajung.com";

export const loadPublications = (file = PUBLICATIONS_FILE) => readJson(file, []);
export function savePublications(list, file = PUBLICATIONS_FILE) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(list, null, 2) + "\n");
}

const npmRun = (script) => {
  const r = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "-s", script], { cwd: ROOT, encoding: "utf8", shell: process.platform === "win32" });
  return { ok: r.status === 0, out: `${r.stdout ?? ""}${r.stderr ?? ""}`.slice(-4000) };
};

/**
 * @param {{ doc: object, approvedBy: string, only?: string[]|null, mode?: "manual"|"auto", runId: string, now?: string,
 *           runStep?: (script:string)=>{ok:boolean,out:string}, publicationsFile?: string, log?: Function }} o
 */
export function publishApproved(o) {
  const log = o.log ?? console.log;
  const now = o.now ?? new Date().toISOString();
  const runStep = o.runStep ?? npmRun;
  if (!o.approvedBy || !/^[\w.\- ]{2,60}$/.test(o.approvedBy)) return { ok: false, stage: "approval", problems: ["승인자(--approved-by)가 없음 — 승인 없이 발행하지 않는다"] };
  if (o.mode === "auto" && String(process.env.AUTO_PUBLISH_ENABLED ?? "") !== "true" && !o.allowAuto) return { ok: false, stage: "approval", problems: ["자동 발행이 꺼져 있음 (AUTO_PUBLISH_ENABLED=true가 아님)"] };
  // Phase 7.3: Gemini가 쓴 원고는 사람이 실행한 발행(manual)으로만 나간다 — 자동 발행 대상에서 뺀다
  if (o.mode === "auto") {
    const llm = (o.doc.drafts ?? []).filter((d) => (!o.only || o.only.includes(d.story?.slug)) && d.verdict === "PUBLISHABLE" && d.generation?.provider === "gemini");
    if (llm.length) return { ok: false, stage: "approval", problems: [`Gemini 자동 작성 원고 ${llm.length}건은 자동 발행 불가 — 편집자 검수 후 사람이 publish.yml(manual)을 실행해야 함`] };
  }
  const pkg = buildPackage(o.doc, { only: o.only ?? null, runId: o.runId, now });
  if (!pkg.ok) return { ok: false, stage: "check", problems: pkg.problems };
  if (!pkg.editorial.length) return { ok: true, stage: "nothing", published: [], problems: [] };
  // 실패하면 되돌리기 위해 바꿀 파일의 지금 내용을 보관
  const touched = new Set([
    ...pkg.candidates.map((c) => path.join(ROOT, "ingest", "candidates", `${c.publishedAt.slice(0, 7)}.json`)),
    ...pkg.editorial.map((e) => path.join(ROOT, "ingest", "editorial", `${e.eventDate.slice(0, 7)}.json`)),
  ]);
  const backup = new Map([...touched].map((f) => [f, fs.existsSync(f) ? fs.readFileSync(f) : null]));
  const restore = () => {
    for (const [f, buf] of backup) {
      if (buf === null) fs.rmSync(f, { force: true });
      else fs.writeFileSync(f, buf);
    }
  };
  writePackage(pkg);
  log(`편집 항목 ${pkg.editorial.length}건 · 후보 ${pkg.candidates.length}건 반영 → npm run publish:daily`);
  const step = runStep("publish:daily");
  if (!step.ok) {
    restore();
    return { ok: false, stage: "publish:daily", problems: ["publish:daily 실패 — 반영한 ingest 파일을 되돌렸습니다", step.out.slice(-800)] };
  }
  // 기사 기록: publishedAt은 publish.mjs가 정한 값을 읽어 온다
  const stories = [];
  const sDir = path.join(ROOT, "content", "stories");
  for (const f of fs.readdirSync(sDir).filter((x) => x.endsWith(".json"))) stories.push(...readJson(path.join(sDir, f), []));
  const list = loadPublications(o.publicationsFile);
  const published = [];
  for (const e of pkg.editorial) {
    const s = stories.find((x) => x.slug === e.slug);
    if (!s) {
      restore();
      return { ok: false, stage: "verify-content", problems: [`발행 후 기사 ${e.slug}를 찾지 못함 — 되돌렸습니다`] };
    }
    const rec = { slug: e.slug, title: e.title, eventDate: s.eventDate, publishedAt: s.publishedAt, sourceUrl: s.sourceUrl, approvedBy: o.approvedBy, approvedAt: now, mode: o.mode ?? "manual", runId: o.runId, url: `${SITE_URL}/stories/${e.slug}/`, deploy: { status: "pending" }, live: { status: "pending" } };
    const i = list.findIndex((x) => x.slug === e.slug);
    if (i >= 0) list[i] = { ...list[i], ...rec };
    else list.push(rec);
    published.push(rec);
  }
  savePublications(list, o.publicationsFile);
  return { ok: true, stage: "done", published, problems: [] };
}

/** Production 배포 (기본 꺼짐). 실패해도 기사 기록은 'deploy failed'로 남아 다음 배포에서 다시 시도된다 */
export function deployProduction({ env = process.env, exec = null, publicationsFile, now = new Date().toISOString() } = {}) {
  const list = loadPublications(publicationsFile);
  const waiting = list.filter((x) => x.deploy?.status !== "ok");
  if (String(env.VERCEL_DEPLOY_ENABLED ?? "") !== "true") return { ok: true, skipped: true, reason: "VERCEL_DEPLOY_ENABLED=true가 아님 — 배포하지 않음 (기본값)", waiting: waiting.length };
  if (!env.VERCEL_TOKEN) return { ok: false, reason: "VERCEL_TOKEN 없음", waiting: waiting.length };
  const run =
    exec ??
    (() => {
      const r = spawnSync(process.platform === "win32" ? "npx.cmd" : "npx", ["--yes", "vercel@63.1.2", "deploy", "--prod", "--yes", `--token=${env.VERCEL_TOKEN}`], { cwd: ROOT, encoding: "utf8", shell: process.platform === "win32", env });
      return { ok: r.status === 0, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
    });
  const r = run();
  const url = (r.out.match(/https:\/\/[\w.-]+\.vercel\.app/g) ?? []).at(-1) ?? null;
  for (const x of waiting) x.deploy = r.ok ? { status: "ok", at: now, deployment: url } : { status: "failed", at: now, attempts: (x.deploy?.attempts ?? 0) + 1, error: r.out.replace(env.VERCEL_TOKEN, "[가림]").slice(-300) };
  savePublications(list, publicationsFile);
  return { ok: r.ok, deployment: url, waiting: waiting.length, reason: r.ok ? null : "Vercel 배포 실패 — 운영 사이트는 이전 상태 그대로, 다음 배포에서 다시 시도" };
}

/** 운영 URL 확인: 배포가 끝난 기사만, 몇 번 다시 시도 */
export async function verifyLive({ fetchImpl = globalThis.fetch, tries = 5, waitMs = 15000, publicationsFile, now = () => new Date().toISOString(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const list = loadPublications(publicationsFile);
  const todo = list.filter((x) => x.deploy?.status === "ok" && x.live?.status !== "ok");
  for (const x of todo) {
    let status = 0;
    for (let i = 0; i < tries; i++) {
      try {
        const res = await fetchImpl(x.url, { method: "GET", signal: AbortSignal.timeout(20000) });
        status = res.status;
        await res.body?.cancel?.();
        if (status === 200) break;
      } catch {
        status = 0;
      }
      if (i < tries - 1) await sleep(waitMs);
    }
    x.live = status === 200 ? { status: "ok", checkedAt: now() } : { status: "failed", httpStatus: status, checkedAt: now() };
  }
  savePublications(list, publicationsFile);
  return { checked: todo.length, ok: todo.filter((x) => x.live.status === "ok").length, failed: todo.filter((x) => x.live.status !== "ok").map((x) => x.slug) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, ...argv] = process.argv.slice(2);
  const arg = (k) => {
    const i = argv.indexOf(k);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  if (cmd === "publish") {
    const file = arg("--drafts");
    if (!file || !fs.existsSync(file)) {
      console.error("사용법: publish --drafts <editorial-drafts.json> --approved-by <이름> [--only a,b] [--mode manual|auto]");
      process.exit(1);
    }
    const doc = JSON.parse(fs.readFileSync(file, "utf8"));
    const r = publishApproved({ doc, approvedBy: arg("--approved-by"), only: arg("--only")?.split(",") ?? null, mode: arg("--mode") ?? "manual", runId: doc.source ?? path.basename(path.dirname(path.dirname(path.resolve(file)))) });
    if (!r.ok) {
      console.error(`발행하지 않음 (${r.stage}):\n- ${r.problems.join("\n- ")}`);
      process.exit(1);
    }
    console.log(r.stage === "nothing" ? "발행할 원고 없음" : `발행 반영 ${r.published.length}건: ${r.published.map((x) => x.slug).join(", ")} (publishedAt ${r.published[0].publishedAt})`);
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `published=${r.published?.length ?? 0}\n`);
  } else if (cmd === "deploy") {
    const r = deployProduction();
    console.log(r.skipped ? r.reason : r.ok ? `배포 완료 ${r.deployment ?? ""} (기사 ${r.waiting}건)` : r.reason);
    if (!r.ok) process.exit(1);
  } else if (cmd === "verify") {
    const r = await verifyLive();
    console.log(`운영 URL 확인 ${r.checked}건 · 열림 ${r.ok} · 실패 ${r.failed.length}${r.failed.length ? ` (${r.failed.join(", ")})` : ""}`);
    if (r.failed.length) process.exit(1);
  } else {
    console.error("사용법: publish.mjs publish|deploy|verify");
    process.exit(1);
  }
}
