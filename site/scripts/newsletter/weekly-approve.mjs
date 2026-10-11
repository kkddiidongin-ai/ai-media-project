#!/usr/bin/env node
/**
 * 주간 뉴스레터 편집자 승인 (이메일을 보내지 않는다. 발송은 newsletter:weekly:send --send로 따로)
 *
 *   npm run newsletter:weekly:approve -- --edition 2026-10-11 --hash <원고 해시 12자> --approver <이름> [--ack-review] [--segment-name <이름>]
 *
 * 확인: 원고 해시 · 최종 QA(Production 재확인) · 발송 설정·발행인 정보·구독 해지 링크 · 구독자 상태(Resend 읽기) · 이미 보낸 호인지.
 * 통과하면 '승인 <id>'를 직접 입력해야 하고, NEWSLETTER_APPROVAL_SECRET으로 서명한 승인을 state.json에 남긴다.
 * 필요: .env.local의 RESEND_API_KEY · NEWSLETTER_APPROVAL_SECRET(승인자만 가진 비밀값) · Segment · Reply-To · NEWSLETTER_OPERATOR_INFO
 * 터미널이 아니면 NEWSLETTER_CONFIRM_TYPED="승인 <id>"를 명시해야 한다.
 */
import readline from "node:readline/promises";
import { Resend } from "resend";
import { loadConfig, loadEnvLocal, loadStories, parseArgs } from "./lib.mjs";
import { Stop, approveWeekly } from "./weekly-delivery.mjs";
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
  if (!process.env.RESEND_API_KEY) throw new Stop("RESEND_API_KEY 없음 — 승인 때 구독자 상태를 확인해야 합니다");
  await approveWeekly({
    id: args.edition,
    hashArg: typeof args.hash === "string" ? args.hash : "",
    approver: typeof args.approver === "string" ? args.approver : "",
    ackReview: Boolean(args["ack-review"]),
    segment: typeof args.segment === "string" ? args.segment : undefined,
    segmentName: typeof args["segment-name"] === "string" ? args["segment-name"] : undefined,
    env: process.env,
    resend: new Resend(process.env.RESEND_API_KEY),
    stories: loadStories(),
    config: await loadConfig(),
    confirm,
    log: (m) => console.log(redact(m)),
  });
} catch (e) {
  console.error(redact(e instanceof Error ? e.message : String(e)));
  process.exitCode = 1;
}
