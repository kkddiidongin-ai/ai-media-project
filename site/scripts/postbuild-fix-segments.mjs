#!/usr/bin/env node
/**
 * 빌드 후처리 (Phase 6.4에서 발견한 문제의 우회)
 *
 * 증상: 정적 export(out/)를 띄우면 링크 프리패치 요청
 *   /stories/<slug>/__next.stories.$d$slug.__PAGE__.txt  → 404 (콘솔 오류, 이동 시 프리패치 실패)
 * 원인: Next.js export(node_modules/next/dist/export/index.js)가 세그먼트 경로의 "/"만 "."로 바꾸는데,
 *   Windows에서는 경로 구분자가 "\"라서 바뀌지 않고, 파일이 폴더 구조
 *   (__next.stories/$d$slug/__PAGE__.txt)로 저장된다. 클라이언트는 점으로 이은 파일 이름을 요청한다.
 * 처리: out/ 안의 "__next.*" 폴더를 찾아, 안의 파일을 점으로 이은 이름으로 같은 위치에 옮기고 폴더를 지운다.
 *   리눅스에서 빌드하면 이런 폴더가 생기지 않으므로 아무 일도 하지 않는다 (몇 번 실행해도 같은 결과).
 */
import fs from "node:fs";
import path from "node:path";

const OUT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "../out");
if (!fs.existsSync(OUT)) process.exit(0);

let moved = 0;
let dirs = 0;

function flatten(segDir) {
  const parent = path.dirname(segDir);
  const prefix = path.basename(segDir); // 예: __next.stories
  const stack = [[segDir, []]];
  while (stack.length) {
    const [dir, parts] = stack.pop();
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) stack.push([p, [...parts, e.name]]);
      else {
        const dest = path.join(parent, [prefix, ...parts, e.name].join("."));
        fs.copyFileSync(p, dest);
        moved++;
      }
    }
  }
  fs.rmSync(segDir, { recursive: true, force: true });
  dirs++;
}

function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const p = path.join(dir, e.name);
    if (e.name.startsWith("__next.")) flatten(p);
    else walk(p);
  }
}

walk(OUT);
console.log(`postbuild: 세그먼트 폴더 ${dirs}개 → 파일 ${moved}개를 점 이름으로 정리`);
