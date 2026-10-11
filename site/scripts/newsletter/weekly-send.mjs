#!/usr/bin/env node
/**
 * 주간 뉴스레터 발송 (사람이 직접 실행. 예약 실행에서는 쓰지 않는다)
 *
 *   점검(외부 호출 없음)  npm run newsletter:weekly:send -- --edition 2026-10-11
 *   테스트 주소           … --test --to a@example.com[,b@example.com]  (최대 5곳, 주소마다 따로, [테스트] 제목, idempotency key)
 *   실제 발송             … --send --confirm 2026-10-11 --hash <원고 해시 12자> --expect-recipients <구독 중 인원>
 *                           [--segment-name <이름> | --segment <id>]  (없으면 RESEND_AUDIENCE_ID Segment)
 *   불확실한 발송 확인    … --reconcile [--confirm-not-sent]
 *
 * 실제 발송 조건: 서명된 승인(APPROVED) · 승인 해시 = 지금 원고 · 최종 QA · 발행인 정보·Reply-To·구독 해지 링크 ·
 *   Resend에 같은 호 Broadcast 없음 · 구독 중 인원 = --expect-recipients · 같은 주소 중복 없음 · 무료 한도 이내 · '발송 <id>' 입력.
 * 터미널이 아니면 NEWSLETTER_CONFIRM_TYPED="발송 <id>"를 명시해야 한다.
 */
import readline from "node:readline/promises";
import { Resend } from "resend";
import { loadConfig, loadEnvLocal, loadStories, parseArgs } from "./lib.mjs";
import { Stop, sendWeekly } from "./weekly-delivery.mjs";
import { redact } from "./weekly.mjs";

async function confirm(q) {
  if (!process.stdin.isTTY) return process.env.NEWSLETTER_CONFIRM_TYPED ?? "";
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await rl.question(q);
  } finally {
    rl.close();
  }
}

try {
  loadEnvLocal();
  const args = parseArgs(process.argv.slice(2));
  if (typeof args.edition !== "string") throw new Stop("--edition <일요일 날짜>가 필요합니다");
  const modes = ["test", "send", "reconcile"].filter((m) => args[m]);
  if (modes.length > 1) throw new Stop("--test · --send · --reconcile 중 하나만 쓸 수 있습니다");
  const mode = modes[0] ?? "check";
  const str = (k) => (typeof args[k] === "string" ? args[k] : undefined);
  const testTo = str("to") ?? process.env.NEWSLETTER_TEST_TO;
  await sendWeekly({
    id: args.edition,
    mode,
    to: testTo ? testTo.split(",") : [],
    again: Boolean(args.again),
    confirmArg: str("confirm"),
    hashArg: str("hash"),
    expectRecipients: args["expect-recipients"] === undefined ? undefined : Number(args["expect-recipients"]),
    confirmNotSent: Boolean(args["confirm-not-sent"]),
    segment: str("segment"),
    segmentName: str("segment-name"),
    env: process.env,
    resend: mode === "check" || !process.env.RESEND_API_KEY ? null : new Resend(process.env.RESEND_API_KEY),
    stories: loadStories(),
    config: await loadConfig(),
    confirm,
  });
} catch (e) {
  console.error(redact(e instanceof Error ? e.message : String(e)));
  process.exitCode = 1;
}
