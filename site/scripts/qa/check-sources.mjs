#!/usr/bin/env node
/**
 * 원문 링크 점검 (broken source URL check)
 *   node scripts/qa/check-sources.mjs
 *
 * 기사·차트에 적힌 원문 주소가 지금도 열리는지 확인한다. 호스트마다 간격을 두고 요청한다.
 * 403(봇 차단)은 '깨진 링크'와 구분해 따로 센다 — 사람이 브라우저로 열면 보이는 경우가 많다.
 * 응답 없이 끊기는 경우(시간 초과·연결 실패)도 '응답 없음'으로 따로 센다. 예: news.samsung.com 기사 페이지는
 *   봇 User-Agent에 응답하지 않는다(같은 서버의 RSS는 정상 응답). 차단을 우회하려고 User-Agent를 속이지 않는다.
 * 실패(exit 1)는 서버가 실제로 없다고 답한 경우(404·410·5xx 등)만이다.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "../..");
const UA = "AIMediaResearchBot/0.1 (+link check)";
const urls = new Map();
for (const f of fs.readdirSync(path.join(ROOT, "content/stories"))) {
  for (const s of JSON.parse(fs.readFileSync(path.join(ROOT, "content/stories", f), "utf8"))) {
    urls.set(s.sourceUrl, s.slug);
    for (const x of s.secondarySources) urls.set(x.sourceUrl, s.slug);
    for (const x of s.references ?? []) urls.set(x.sourceUrl, `deep:${s.slug}`); // 심층 기사의 추가 확인 자료 (Phase 6.4.2)
  }
}
for (const f of fs.readdirSync(path.join(ROOT, "content/charts"))) {
  const c = JSON.parse(fs.readFileSync(path.join(ROOT, "content/charts", f), "utf8"));
  for (const s of c.sources) if (s.url.startsWith("http")) urls.set(s.url, `chart:${c.slug}`);
  for (const i of c.items) if (i.sourceUrl) urls.set(i.sourceUrl, `chart:${c.slug}`);
}

// 호스트마다 하나의 작업자: 같은 호스트에는 400ms 간격으로 순서대로, 서로 다른 호스트는 동시에 (Phase 6.4)
// #fragment만 다른 주소(예: docs.x.ai 릴리스 노트의 항목들)는 서버 입장에서 같은 페이지라 한 번만 요청한다
const result = { ok: 0, blocked: [], unreachable: [], broken: [], redirected: [] };
const pages = new Map(); // fragment 뺀 주소 → 이 주소를 쓰는 곳들
for (const [url, owner] of urls) {
  const key = url.split("#")[0];
  if (!pages.has(key)) pages.set(key, []);
  pages.get(key).push(owner);
}
const byHost = new Map();
for (const [url, owners] of pages) {
  const host = new URL(url).host;
  if (!byHost.has(host)) byHost.set(host, []);
  byHost.get(host).push([url, owners]);
}
let done = 0;
const total = pages.size;
async function worker(list) {
  for (const [url, owners] of list) {
    const owner = owners.length > 1 ? `${owners[0]} 외 ${owners.length - 1}` : owners[0];
    try {
      const r = await fetch(url, { method: "GET", headers: { "user-agent": UA }, redirect: "follow", signal: AbortSignal.timeout(20000) });
      await r.body?.cancel();
      // 정상 응답이지만 다른 주소로 옮겨진 경우(경로 변경 등)는 따로 기록한다. 같은 페이지의 http→https·끝 슬래시 차이는 제외
      const norm = (u) => u.split("#")[0].replace(/^http:/, "https:").replace(/\/$/, "");
      if (r.ok) {
        result.ok++;
        if (r.redirected && norm(r.url) !== norm(url)) result.redirected.push(`${url} → ${r.url} (${owner})`);
      } else if (r.status === 403 || r.status === 429) result.blocked.push(`${r.status} ${url} (${owner})`);
      else result.broken.push(`${r.status} ${url} (${owner})`);
    } catch (e) {
      result.unreachable.push(`${e.name === "TimeoutError" ? "TIMEOUT" : "NETWORK"} ${url} (${owner})`);
    }
    if (++done % 100 === 0) console.error(`… ${done}/${total}`);
    await new Promise((r) => setTimeout(r, 400));
  }
}
await Promise.all([...byHost.values()].map(worker));
console.log(`checked ${urls.size} links (${pages.size} pages, ${byHost.size} hosts) · ok ${result.ok} · bot-blocked ${result.blocked.length} · unreachable ${result.unreachable.length} · broken ${result.broken.length} · redirected ${result.redirected.length}`);
for (const b of result.blocked) console.log(`blocked ${b}`);
for (const b of result.unreachable) console.log(`no-resp ${b}`);
for (const b of result.broken) console.log(`BROKEN  ${b}`);
for (const b of result.redirected) console.log(`moved   ${b}`);
const hosts = (list) => Object.entries(list.reduce((m, x) => ((m[new URL(x.split(" ")[1]).host] = (m[new URL(x.split(" ")[1]).host] ?? 0) + 1), m), {})).map(([h, n]) => `${h} ${n}`).join(", ");
console.log(`summary · bot-blocked by host: ${hosts(result.blocked) || "-"} · unreachable by host: ${hosts(result.unreachable) || "-"}`);
fs.mkdirSync(path.join(ROOT, "ingest/log"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "ingest/log", `link-check-${new Date().toISOString().slice(0, 10)}.json`), JSON.stringify({ checkedAt: new Date().toISOString(), total: urls.size, pages: pages.size, ...result }, null, 2));
process.exit(result.broken.length ? 1 : 0);
