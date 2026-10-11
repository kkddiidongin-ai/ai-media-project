#!/usr/bin/env node
/**
 * 주간 뉴스레터 준비 (예약 workflow와 사람이 같은 명령을 쓴다). 이메일을 보내지 않고, 발송 서비스에 접속하지 않는다.
 *
 *   npm run newsletter:weekly                          # 오늘(한국 시간)이 속한 주의 일요일 호
 *   npm run newsletter:weekly -- --edition 2026-10-11  # 그 일요일 호 (대상: 10.4~10.10)
 *   npm run newsletter:weekly -- --date 2026-10-13     # 그 날짜가 속한 주의 일요일 호 (2026-10-11)
 *   … --offline                                        # Production 사이트맵을 읽지 않음 → 발행 확인 불가로 HOLD (원고 확인용)
 *
 * 결과: newsletter/weekly/<id>/ edition.json · state.json · preview.html · preview.txt · report.md
 * 같은 호를 다시 돌리면: 내용이 같으면 파일을 바꾸지 않고, 승인(APPROVED)·발송(SENT)된 호는 건드리지 않으며, 사람이 고친 원고는 다시 만들지 않는다.
 */
import { loadConfig, loadStories, parseArgs } from "./lib.mjs";
import { editionIdFor, isDate, isSunday, kstDate, prepareWeekly, redact, shortHash } from "./weekly.mjs";

const args = parseArgs(process.argv.slice(2));
try {
  let id;
  if (typeof args.edition === "string") {
    if (!isSunday(args.edition)) throw new Error(`--edition은 일요일 날짜(YYYY-MM-DD)여야 합니다: ${args.edition}`);
    id = args.edition;
  } else {
    const d = typeof args.date === "string" ? args.date : kstDate();
    if (!isDate(d)) throw new Error(`--date 형식 오류: ${d}`);
    id = editionIdFor(d);
  }
  const config = await loadConfig();
  const r = await prepareWeekly({
    id,
    stories: loadStories(),
    config,
    production: args.offline ? { ok: false, error: "--offline (확인 안 함)", slugs: new Set(), url: null } : null,
  });
  if (r.locked) {
    console.log(r.message);
  } else {
    console.log(`주간 호 ${id} · 대상 ${r.state.period.start} ~ ${r.state.period.end}`);
    console.log(`상태: ${r.status}${r.status === "READY" ? " (자동 검증 통과 — 승인 아님)" : ""} · QA ${r.qa.verdict}${r.edited ? " · 편집자가 고친 원고" : ""}`);
    if (r.edition) console.log(`제목: ${r.edition.subject}\n원고 해시: ${shortHash(r.state.contentHash)}`);
    for (const i of r.qa.items) console.log(`  ${i.level} ${i.code} ${i.msg}`);
    console.log(`${r.changed ? "저장" : "변경 없음"}: newsletter/weekly/${id}/`);
  }
  if (process.env.GITHUB_OUTPUT) {
    const fs = await import("node:fs");
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `id=${id}\nstatus=${r.status}\nchanged=${r.changed}\nlocked=${Boolean(r.locked)}\n`);
  }
} catch (e) {
  console.error(redact(e instanceof Error ? e.message : String(e)));
  process.exitCode = 1;
}
