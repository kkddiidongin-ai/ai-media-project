#!/usr/bin/env node
/**
 * 심층 기사(Phase 6.4.1 Editorial Depth Pilot)용 원문 확인 도구
 *   node scripts/ingest/research.mjs <outDir> <url> [url ...]
 *
 * - robots.txt(일반·AI 크롤러 그룹)가 막으면 요청하지 않는다.
 * - 403·429·페이월은 우회하지 않는다 (User-Agent 위장·캐시·프록시 사용 안 함).
 * - 본문 텍스트를 편집자가 읽기 위한 메모로만 저장한다. 사이트에 원문을 옮기지 않는다.
 */
import fs from "node:fs";
import path from "node:path";
import { politeFetch, robotsAllowed, stripHtml } from "./lib.mjs";

const args = process.argv.slice(2);
const full = args.includes("--full"); // <article>/<main>을 고르지 않고 페이지 전체 본문 텍스트
const [outDir, ...urls] = args.filter((a) => a !== "--full");
if (!outDir || urls.length === 0) {
  console.error("usage: node scripts/ingest/research.mjs <outDir> <url> [url ...]");
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });

function mainText(html) {
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<(nav|header|footer|aside|svg|form)[\s\S]*?<\/\1>/gi, " ");
  const pick = full ? cleaned : (cleaned.match(/<article[\s\S]*<\/article>/i)?.[0] ?? cleaned.match(/<main[\s\S]*<\/main>/i)?.[0] ?? cleaned);
  // 문단·제목·목록 경계는 줄바꿈으로 남긴다
  const withBreaks = pick.replace(/<\/(p|h[1-6]|li|tr|div|section)>/gi, "\n").replace(/<br\s*\/?>/gi, "\n").replace(/<li[^>]*>/gi, "• ");
  return withBreaks
    .split("\n")
    .map((l) => stripHtml(l).replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 1)
    .join("\n");
}

for (const url of urls) {
  const name = url.replace(/^https?:\/\//, "").replace(/[^a-z0-9]+/gi, "_").slice(0, 120) + ".txt";
  if (!(await robotsAllowed(url))) {
    console.log(`ROBOTS-BLOCKED ${url}`);
    continue;
  }
  try {
    const r = await politeFetch(url, { delay: 1500, accept: "text/html" });
    if (!r.ok) {
      console.log(`HTTP ${r.status} ${url} (우회하지 않음)`);
      await r.body?.cancel();
      continue;
    }
    const text = mainText(await r.text());
    fs.writeFileSync(path.join(outDir, name), `URL: ${url}\nFETCHED: ${new Date().toISOString()}\n\n${text}\n`);
    console.log(`OK ${text.length}자 ${url} → ${name}`);
  } catch (e) {
    console.log(`ERR ${e.name} ${url}`);
  }
}
