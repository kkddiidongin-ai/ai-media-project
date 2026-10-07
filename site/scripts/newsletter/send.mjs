#!/usr/bin/env node
/**
 * 실제 발송 (구독자 Segment 전체에 Resend Broadcast로 보낸다)
 *
 * 세 단계로 나눠 실수로 보내는 일을 막는다. 자동 발송(cron)은 두지 않는다.
 *   1) npm run newsletter:send -- --date 2026-10-05
 *        점검만 한다 (외부 호출 없음). 빠진 설정·이미 보낸 호인지 확인하고 미리보기 파일을 만든다.
 *   2) npm run newsletter:send -- --date 2026-10-05 --draft
 *        Resend에 '초안' Broadcast를 만든다 (아무에게도 가지 않음). Resend 화면에서 최종 확인할 수 있다.
 *   3) npm run newsletter:send -- --date 2026-10-05 --send --confirm 2026-10-05
 *        실제 발송. --confirm 값이 날짜와 같아야 하고, 터미널에서는 '발송'을 한 번 더 입력해야 한다.
 *        보낸 기록은 ingest/newsletter-sent.json에 남고, 같은 호는 두 번 보내지 않는다.
 *
 * 필요: RESEND_API_KEY, RESEND_AUDIENCE_ID(Segment ID), 인증 도메인의 발신 주소, 실제 받은편지함이 있는 Reply-To. 하나라도 없으면 멈춘다.
 * 선택: --subject "…" --preheader "…" (없으면 메인 기사 제목·요약으로 만든다)
 */
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { Resend } from "resend";
import { ROOT, loadConfig, loadEnvLocal, loadIssues, loadStories, parseArgs, renderIssueEmail, sendSettings } from "./lib.mjs";

loadEnvLocal();
const args = parseArgs(process.argv.slice(2));
const config = await loadConfig();
const SENT = path.join(ROOT, "ingest/newsletter-sent.json");
const sent = fs.existsSync(SENT) ? JSON.parse(fs.readFileSync(SENT, "utf8")) : [];

const stop = (msg) => {
  console.error(msg);
  process.exit(1);
};

const date = typeof args.date === "string" ? args.date : null;
if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) stop("--date YYYY-MM-DD 가 필요합니다 (보낼 호를 반드시 직접 지정).");
const stories = loadStories();
const issue = loadIssues(stories).find((i) => i.date === date);
if (!issue) stop(`${date} 호가 없습니다.`);
if (sent.some((s) => s.date === date && s.status === "sent")) stop(`${date} 호는 이미 발송했습니다 (ingest/newsletter-sent.json).`);

const mail = renderIssueEmail(issue, { mode: "broadcast", allStories: stories, config, subject: args.subject, preheader: args.preheader });
const settings = sendSettings(process.env, config.newsletterConfig);
const outDir = path.join(ROOT, "ingest/log/newsletter-preview");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, `send-${date}.html`), mail.html);

console.log(`호: ${date} · ${issue.stories.length}건`);
console.log(`제목: ${mail.subject}`);
console.log(`프리헤더: ${mail.preheader}`);
console.log(`보낸 사람: ${settings.from || "(없음)"}`);
console.log(`미리보기: ingest/log/newsletter-preview/send-${date}.html`);
if (!mail.html.includes("{{{RESEND_UNSUBSCRIBE_URL}}}")) stop("수신거부 링크가 메일에 없습니다. 발송하지 않습니다.");
if (settings.problems.length) stop("설정이 빠져 발송할 수 없습니다:\n- " + settings.problems.join("\n- "));
// 정기 뉴스레터는 답장(문의·수신거부 요청)을 실제로 받을 수 있어야 한다. 받은편지함이 준비되기 전에는 보내지 않는다
if (!settings.replyTo) stop("Reply-To 주소가 없습니다. 실제로 받아 볼 수 있는 받은편지함(예정: hello@aimajung.com)을 만든 뒤 NEWSLETTER_REPLY_TO 또는 newsletterReplyTo에 넣으세요.");

if (!args.draft && !args.send) {
  console.log("\n점검 완료 (외부 호출 없음). 초안은 --draft, 실제 발송은 --send --confirm <날짜>.");
  process.exit(0);
}

if (args.send) {
  if (args.confirm !== date) stop(`실제 발송하려면 --confirm ${date} 를 함께 적어야 합니다.`);
  if (process.stdin.isTTY) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(`구독자 전체에게 ${date} 호를 보냅니다. 계속하려면 '발송'을 입력하세요: `);
    rl.close();
    if (answer.trim() !== "발송") stop("취소했습니다.");
  }
}

const resend = new Resend(settings.apiKey);
const payload = {
  name: `AI마중 ${date}`,
  segmentId: settings.segmentId,
  from: settings.from,
  replyTo: settings.replyTo,
  subject: mail.subject,
  previewText: mail.preheader,
  html: mail.html,
  text: mail.text,
};
const { data, error } = await resend.broadcasts.create(args.send ? { ...payload, send: true } : payload);
if (error) stop(`Resend 요청 실패: ${error.name}${error.statusCode ? ` (${error.statusCode})` : ""}`);

const record = { date, subject: mail.subject, broadcastId: data.id, status: args.send ? "sent" : "draft", at: new Date().toISOString() };
fs.writeFileSync(SENT, JSON.stringify([...sent, record], null, 2) + "\n");
console.log(args.send ? `\n발송 요청 완료 · broadcast ${data.id}` : `\n초안 생성 완료 · broadcast ${data.id} (아직 보내지 않음)`);
