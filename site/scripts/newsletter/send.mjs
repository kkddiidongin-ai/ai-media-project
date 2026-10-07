#!/usr/bin/env node
/**
 * 실제 발송 (Resend Broadcast로 Segment에 보낸다)
 *
 * 단계를 나눠 실수로 보내는 일을 막는다. 자동 발송(cron)은 두지 않는다.
 *   1) npm run newsletter:send -- --edition 2026-10-06 [--segment-name "…" --expect-recipients 1]
 *        점검만 한다 (외부 호출 없음). 빠진 설정·이미 보낸 호인지 확인하고 미리보기 파일을 만든다.
 *   2) … --draft
 *        받는 사람(Segment 실제 연락처)을 다시 확인한 뒤 Resend에 '초안' Broadcast를 만든다 (아무에게도 가지 않음).
 *        만든 초안을 Resend에서 다시 읽어 제목·보낸 사람·Reply-To·본문·구독 해지 자리를 확인한다.
 *        초안 기록은 ingest/log/newsletter-drafts.json(git 제외)에만 남긴다. 발송 기록에는 쓰지 않는다.
 *   3) … --send --confirm 2026-10-06 [--broadcast <초안 id>]
 *        실제 발송. --confirm 값이 호 날짜와 같아야 하고, 받는 사람을 다시 확인한 뒤 '발송'을 입력해야 보낸다.
 *        (터미널이 아니면 NEWSLETTER_CONFIRM_TYPED=발송 을 명시해야 한다)
 *        --broadcast를 주면 그 초안을 다시 읽어 지금 렌더링한 내용과 같은지 확인한 뒤 그 초안을 보낸다.
 *        보낸 기록은 ingest/newsletter-sent.json에 남고(이메일 주소 없음), 같은 호를 같은 Segment에 두 번 보내지 않는다.
 *
 * 받는 사람:
 *   --segment <id> 또는 --segment-name <이름>  지정한 Segment로 보낸다 (없으면 RESEND_AUDIENCE_ID).
 *   --expect-recipients <N>                     Segment를 지정하면 필수. 실제 연락처가 정확히 N명이고 모두 구독 중이어야 한다.
 *   --expect-email <주소>                       (선택) 실제 연락처가 정확히 이 주소여야 한다. 쉼표로 여러 개.
 *
 * 필요: RESEND_API_KEY, Segment, 인증 도메인의 발신 주소, 실제 받은편지함이 있는 Reply-To. 하나라도 없으면 멈춘다.
 * 선택: --subject "…" --preheader "…" (없으면 원고·메인 기사로 만든다)
 * 편집 호: --edition 2026-10-06 (newsletter/editions/<id>.json). --date 대신 쓰고, --confirm 값도 편집 호 id와 같아야 한다.
 */
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { Resend } from "resend";
import {
  ROOT,
  alreadySent,
  checkRecipients,
  listSegmentMembers,
  loadConfig,
  loadEdition,
  loadEnvLocal,
  loadIssues,
  loadStories,
  maskEmail,
  parseArgs,
  renderEditionEmail,
  renderIssueEmail,
  resolveSegment,
  sendSettings,
  verifyBroadcast,
} from "./lib.mjs";

/** 멈춤: 이유를 출력하고 종료 코드 1. process.exit 대신 예외로 빠져나간다 (네트워크 연결이 닫히는 중에 exit하면 Windows Node가 비정상 종료) */
class Stop extends Error {}
const stop = (msg) => {
  console.error(msg);
  throw new Stop(msg);
};

async function main() {
loadEnvLocal();
const args = parseArgs(process.argv.slice(2));
const config = await loadConfig();
// 기록 파일 위치 (시험용으로 바꿀 수 있다)
const SENT = process.env.NEWSLETTER_SENT_FILE || path.join(ROOT, "ingest/newsletter-sent.json");
const DRAFTS = process.env.NEWSLETTER_DRAFT_LOG || path.join(ROOT, "ingest/log/newsletter-drafts.json");
const readJson = (p) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : []);
const sent = readJson(SENT);

const edition = typeof args.edition === "string" ? loadEdition(args.edition) : null;
const date = edition ? edition.id : typeof args.date === "string" ? args.date : null;
if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) stop("--date YYYY-MM-DD 또는 --edition <id>가 필요합니다 (보낼 호를 반드시 직접 지정).");
const stories = loadStories();
const issue = edition ? null : loadIssues(stories).find((i) => i.date === date);
if (!edition && !issue) stop(`${date} 호가 없습니다.`);

const explicitSegment = typeof args.segment === "string" || typeof args["segment-name"] === "string";
const expect = args["expect-recipients"] === undefined ? null : Number(args["expect-recipients"]);
const expectEmails = typeof args["expect-email"] === "string" ? args["expect-email"].split(",").filter(Boolean) : [];
if (explicitSegment && expect === null) stop("Segment를 지정하면 --expect-recipients <N>도 함께 적어야 합니다.");

const renderOpts = { mode: "broadcast", allStories: stories, config, subject: args.subject, preheader: args.preheader };
const mail = edition ? renderEditionEmail(edition, renderOpts) : renderIssueEmail(issue, renderOpts);
const settings = sendSettings(process.env, config.newsletterConfig);
// Segment를 직접 지정하면 RESEND_AUDIENCE_ID가 없어도 된다
const problems = explicitSegment ? settings.problems.filter((p) => !p.startsWith("RESEND_AUDIENCE_ID")) : settings.problems;
const webUrl = `${config.siteConfig.url.replace(/\/$/, "")}/newsletters/${date}/`;
const outDir = path.join(ROOT, "ingest/log/newsletter-preview");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, `send-${date}.html`), mail.html);

console.log(edition ? `편집 호: ${date} (${edition.number}호)` : `호: ${date} · ${issue.stories.length}건`);
console.log(`제목: ${mail.subject}`);
console.log(`프리헤더: ${mail.preheader}`);
console.log(`보낸 사람: ${settings.from || "(없음)"}`);
console.log(`Reply-To: ${settings.replyTo ? "설정됨" : "(없음)"}`);
console.log(`받는 사람: ${explicitSegment ? `${args["segment-name"] ? `Segment '${args["segment-name"]}'` : "지정 Segment"} · 기대 ${expect}명` : "RESEND_AUDIENCE_ID Segment 전체"}`);
console.log(`미리보기: ingest/log/newsletter-preview/send-${date}.html`);
if (!mail.html.includes("{{{RESEND_UNSUBSCRIBE_URL}}}") || !mail.text.includes("{{{RESEND_UNSUBSCRIBE_URL}}}")) stop("수신거부 링크가 메일에 없습니다. 발송하지 않습니다.");
if (problems.length) stop("설정이 빠져 발송할 수 없습니다:\n- " + problems.join("\n- "));
// 정기 뉴스레터는 답장(문의·수신거부 요청)을 실제로 받을 수 있어야 한다. 받은편지함이 준비되기 전에는 보내지 않는다
if (!settings.replyTo) stop("Reply-To 주소가 없습니다. 실제로 받아 볼 수 있는 받은편지함(예정: hello@aimajung.com)을 만든 뒤 NEWSLETTER_REPLY_TO 또는 newsletterReplyTo에 넣으세요.");

if (!args.draft && !args.send) {
  if (!explicitSegment && alreadySent(sent, date, settings.segmentId)) stop(`${date} 호는 이 Segment에 이미 발송했습니다 (ingest/newsletter-sent.json).`);
  console.log("\n점검 완료 (외부 호출 없음). 초안은 --draft, 실제 발송은 --send --confirm <날짜>.");
  return;
}
if (args.draft && args.send) stop("--draft와 --send는 함께 쓸 수 없습니다.");
if (args.send && args.confirm !== date) stop(`실제 발송하려면 --confirm ${date} 를 함께 적어야 합니다.`);

const resend = new Resend(settings.apiKey);

// 1) 받는 사람 확인 (Segment 존재 → 실제 연락처 목록)
let segment;
try {
  segment = await resolveSegment(resend, { segment: args.segment, segmentName: args["segment-name"], fallbackId: explicitSegment ? null : settings.segmentId });
} catch (e) {
  stop(e.message);
}
if (alreadySent(sent, date, segment.id)) stop(`${date} 호는 이 Segment에 이미 발송했습니다 (ingest/newsletter-sent.json).`);
let members = null;
if (expect !== null || expectEmails.length) {
  try {
    members = await listSegmentMembers(resend, segment.id);
  } catch (e) {
    stop(e.message);
  }
  const bad = checkRecipients(members, { expect, expectEmails });
  if (bad.length) stop("받는 사람 확인 실패 — 보내지 않습니다:\n- " + bad.join("\n- "));
  console.log(`받는 사람 확인: Segment '${segment.name}' · ${members.length}명 · 모두 구독 중 · ${members.map((m) => maskEmail(m.email)).join(", ")}`);
}

const want = { segmentId: segment.id, subject: mail.subject, from: settings.from, replyTo: settings.replyTo, html: mail.html, text: mail.text, webUrl: edition ? webUrl : null };
const payload = {
  name: `AI마중 ${date}${edition ? ` (${edition.number}호)` : ""}`,
  segmentId: segment.id,
  from: settings.from,
  replyTo: settings.replyTo,
  subject: mail.subject,
  previewText: mail.preheader,
  html: mail.html,
  text: mail.text,
};

// 2) 초안
if (args.draft) {
  const created = await resend.broadcasts.create(payload); // send 옵션 없음 = 초안
  if (created.error) stop(`Resend 초안 생성 실패: ${created.error.name}${created.error.statusCode ? ` (${created.error.statusCode})` : ""}`);
  const id = created.data.id;
  const stored = await resend.broadcasts.get(id);
  if (stored.error) stop(`초안은 만들었지만 다시 읽지 못했습니다 (broadcast ${id}): ${stored.error.name}`);
  const bad = verifyBroadcast(stored.data, { ...want, status: "draft" });
  fs.mkdirSync(path.dirname(DRAFTS), { recursive: true });
  fs.writeFileSync(DRAFTS, JSON.stringify([...readJson(DRAFTS), { date, broadcastId: id, segmentId: segment.id, recipients: members?.length ?? null, status: "draft", at: new Date().toISOString() }], null, 2) + "\n");
  if (bad.length) stop(`초안 ${id}이 의도와 다릅니다 — 보내지 마세요:\n- ` + bad.join("\n- "));
  console.log(`\n초안 생성·확인 완료 · broadcast ${id} (아직 보내지 않음)`);
  console.log("확인: 상태 draft · Segment · 제목 · 보낸 사람 · Reply-To · HTML/텍스트 본문 · 구독 해지 자리 · 웹에서 보기");
  return;
}

// 3) 실제 발송: 받는 사람 확인 뒤, 보내기 직전에 '발송' 입력
if (process.stdin.isTTY) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const who = members ? `${members.length}명` : `Segment '${segment.name}' 전체`;
  const answer = await rl.question(`${date} 호를 ${who}에게 보냅니다. 계속하려면 '발송'을 입력하세요: `);
  rl.close();
  if (answer.trim() !== "발송") stop("취소했습니다.");
} else if (process.env.NEWSLETTER_CONFIRM_TYPED !== "발송") {
  stop("터미널이 아니어서 '발송' 입력을 받을 수 없습니다. 직접 터미널에서 실행하거나 NEWSLETTER_CONFIRM_TYPED=발송 을 명시하세요.");
}

let broadcastId;
if (typeof args.broadcast === "string") {
  // 검토한 초안을 그대로 보낸다: 지금 렌더링한 내용·Segment와 같은지 다시 확인
  const stored = await resend.broadcasts.get(args.broadcast);
  if (stored.error) stop(`초안을 읽지 못했습니다: ${stored.error.name}`);
  const bad = verifyBroadcast(stored.data, { ...want, status: "draft" });
  if (bad.length) stop("초안이 지금 내용과 다릅니다 — 보내지 않습니다:\n- " + bad.join("\n- "));
  const r = await resend.broadcasts.send(args.broadcast);
  if (r.error) stop(`Resend 발송 실패: ${r.error.name}${r.error.statusCode ? ` (${r.error.statusCode})` : ""}`);
  broadcastId = args.broadcast;
} else {
  const r = await resend.broadcasts.create({ ...payload, send: true });
  if (r.error) stop(`Resend 발송 실패: ${r.error.name}${r.error.statusCode ? ` (${r.error.statusCode})` : ""}`);
  broadcastId = r.data.id;
}

// 발송 기록: 이메일 주소는 남기지 않는다
const record = { date, edition: edition ? edition.id : null, subject: mail.subject, broadcastId, status: "sent", at: new Date().toISOString(), segmentId: segment.id, recipients: members?.length ?? null };
fs.writeFileSync(SENT, JSON.stringify([...sent, record], null, 2) + "\n");
console.log(`\n발송 요청 완료 · broadcast ${broadcastId} · ${members ? `${members.length}명` : `Segment '${segment.name}'`}`);
}

try {
  await main();
} catch (e) {
  if (!(e instanceof Stop)) console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
}
