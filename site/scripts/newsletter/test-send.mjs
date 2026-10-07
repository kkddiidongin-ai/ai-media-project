#!/usr/bin/env node
/**
 * 테스트 발송: 지정한 주소 한 곳에만 보낸다 (구독자 Segment에는 보내지 않는다)
 *
 *   npm run newsletter:test -- --to me@example.com [--date 2026-10-05]
 *   npm run newsletter:test -- --to me@example.com --edition 2026-10-06   # 편집 호
 *   (또는 .env.local의 NEWSLETTER_TEST_TO)
 *
 * 필요: RESEND_API_KEY, 인증된 도메인의 발신 주소(NEWSLETTER_FROM_EMAIL). 없으면 보내지 않고 멈춘다.
 * 제목 앞에 [테스트]가 붙고, 수신거부 링크는 사이트의 수신거부 안내 페이지로 들어간다.
 */
import { Resend } from "resend";
import { loadConfig, loadEdition, loadEnvLocal, loadIssues, loadStories, maskEmail, parseArgs, renderEditionEmail, renderIssueEmail, sendSettings } from "./lib.mjs";

loadEnvLocal();
const args = parseArgs(process.argv.slice(2));
const config = await loadConfig();
const to = (typeof args.to === "string" ? args.to : process.env.NEWSLETTER_TEST_TO || "").trim();
const settings = sendSettings(process.env, config.newsletterConfig);
const problems = settings.problems.filter((p) => !p.startsWith("RESEND_AUDIENCE_ID")); // 테스트는 Segment가 필요 없다
if (!config.normalizeEmail(to)) problems.push("받는 주소(--to 또는 NEWSLETTER_TEST_TO) 없음·형식 오류");
if (problems.length) {
  console.error("테스트 발송을 하지 않았습니다:\n- " + problems.join("\n- "));
  process.exit(1);
}

const stories = loadStories();
const issues = loadIssues(stories);
const edition = typeof args.edition === "string" ? loadEdition(args.edition) : null;
const date = edition ? edition.id : typeof args.date === "string" ? args.date : issues[0].date;
const issue = edition ? null : issues.find((i) => i.date === date);
if (!edition && !issue) {
  console.error(`${date} 호가 없습니다.`);
  process.exit(1);
}
const renderOpts = { mode: "test", allStories: stories, config, subject: args.subject, preheader: args.preheader };
const mail = edition ? renderEditionEmail(edition, renderOpts) : renderIssueEmail(issue, renderOpts);
const resend = new Resend(settings.apiKey);
const { data, error } = await resend.emails.send({
  from: settings.from,
  to: [to],
  replyTo: settings.replyTo,
  subject: `[테스트] ${mail.subject}`,
  html: mail.html,
  text: mail.text,
});
if (error) {
  console.error(`테스트 발송 실패: ${error.name}${error.statusCode ? ` (${error.statusCode})` : ""}`);
  process.exit(1);
}
console.log(`테스트 발송 완료 → ${maskEmail(to)} · ${date} · id ${data.id}`);
