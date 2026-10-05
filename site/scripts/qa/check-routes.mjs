#!/usr/bin/env node
/**
 * 내부 링크 점검 (빌드 결과물 out/ 기준, 외부 접속 없음)
 *   npm run build && node scripts/qa/check-routes.mjs
 *
 * - out/ 안의 모든 HTML에서 내부 링크(href·src, "/"로 시작)를 모아 대상 파일이 실제로 있는지 확인
 * - 링크에 #anchor가 있으면 대상 페이지에 그 id가 있는지 확인
 * - 호환 경로(/archive/ /tasks/ /weekly/ /record/)와 sitemap.xml의 모든 주소가 실제 파일로 열리는지 확인
 * - 결과: 페이지 수 · 링크 수 · 깨진 링크 목록 (하나라도 있으면 exit 1)
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "../..");
const OUT = path.join(ROOT, "out");
if (!fs.existsSync(OUT)) {
  console.error("out/ 없음 — 먼저 npm run build");
  process.exit(1);
}

function walk(dir) {
  const files = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) files.push(...walk(p));
    else files.push(p);
  }
  return files;
}

const all = walk(OUT);
const html = all.filter((f) => f.endsWith(".html"));
const rel = (f) => "/" + path.relative(OUT, f).split(path.sep).join("/");

/** 주소 → 실제 파일 (정적 export, trailingSlash: true) */
function resolveTarget(p) {
  const clean = decodeURIComponent(p);
  const cands = clean.endsWith("/") ? [clean + "index.html"] : path.extname(clean) ? [clean] : [clean + "/index.html", clean + ".html", clean];
  for (const c of cands) {
    const f = path.join(OUT, c);
    if (fs.existsSync(f) && fs.statSync(f).isFile()) return f;
  }
  return null;
}

const idCache = new Map();
function idsOf(file) {
  if (!idCache.has(file)) {
    const t = fs.readFileSync(file, "utf8");
    idCache.set(file, new Set([...t.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])));
  }
  return idCache.get(file);
}

const broken = [];
const brokenAnchors = [];
let links = 0;
const targets = new Set();

for (const file of html) {
  const text = fs.readFileSync(file, "utf8");
  // RSC 데이터·스크립트 안의 문자열은 빼고, 실제 속성만 본다
  for (const m of text.matchAll(/\s(?:href|src)="([^"]+)"/g)) {
    const raw = m[1].replace(/&amp;/g, "&");
    if (!raw.startsWith("/") || raw.startsWith("//")) continue;
    links++;
    const [pathPart, hash] = raw.split("#");
    const p = pathPart.split("?")[0] || rel(file);
    const target = resolveTarget(p);
    if (!target) {
      broken.push(`${rel(file)} → ${raw}`);
      continue;
    }
    targets.add(p);
    if (hash && target.endsWith(".html") && !idsOf(target).has(decodeURIComponent(hash))) brokenAnchors.push(`${rel(file)} → ${raw}`);
  }
  // 같은 페이지 앵커 (#slug)
  for (const m of text.matchAll(/\shref="#([^"]+)"/g)) {
    links++;
    if (!idsOf(file).has(decodeURIComponent(m[1]))) brokenAnchors.push(`${rel(file)} → #${m[1]}`);
  }
}

// 호환 경로
const compat = ["/archive/", "/tasks/", "/weekly/", "/record/"];
const compatMissing = compat.filter((c) => !resolveTarget(c));

// sitemap
const sitemapMissing = [];
let sitemapCount = 0;
const smFile = path.join(OUT, "sitemap.xml");
if (fs.existsSync(smFile)) {
  for (const m of fs.readFileSync(smFile, "utf8").matchAll(/<loc>([^<]+)<\/loc>/g)) {
    sitemapCount++;
    const p = new URL(m[1]).pathname;
    if (!resolveTarget(p)) sitemapMissing.push(p);
  }
}

console.log(`pages ${html.length} · internal links ${links} · distinct targets ${targets.size} · sitemap urls ${sitemapCount}`);
console.log(`compat routes ${compat.length - compatMissing.length}/${compat.length} OK`);
for (const b of broken.slice(0, 50)) console.error(`BROKEN ${b}`);
for (const b of brokenAnchors.slice(0, 50)) console.error(`ANCHOR ${b}`);
for (const c of compatMissing) console.error(`COMPAT ${c} 없음`);
for (const s of sitemapMissing) console.error(`SITEMAP ${s} 파일 없음`);
const total = broken.length + brokenAnchors.length + compatMissing.length + sitemapMissing.length;
if (total) {
  console.error(`실패 — 깨진 링크 ${broken.length} · 앵커 ${brokenAnchors.length} · 호환 경로 ${compatMissing.length} · sitemap ${sitemapMissing.length}`);
  process.exit(1);
}
console.log("OK — 깨진 내부 링크·앵커·호환 경로·sitemap 이상 없음");
