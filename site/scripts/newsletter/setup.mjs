#!/usr/bin/env node
/**
 * Resend 연결 점검 · 준비 (처음 한 번, 그리고 설정을 바꿨을 때)
 *
 *   npm run newsletter:setup            # 점검만
 *   npm run newsletter:setup -- --apply # 관심 분야 연락처 속성(interests)이 없으면 만든다
 *
 * 확인하는 것: API 키 동작, Segment(예전 Audience) 존재, 발신 도메인 인증 상태, interests 속성.
 * 키·주소 값은 출력하지 않는다.
 */
import { Resend } from "resend";
import { loadConfig, loadEnvLocal, parseArgs, sendSettings } from "./lib.mjs";

loadEnvLocal();
const args = parseArgs(process.argv.slice(2));
const { newsletterConfig } = await loadConfig();
const s = sendSettings(process.env, newsletterConfig);
const ok = (m) => console.log(`OK    ${m}`);
const bad = (m) => {
  console.log(`필요  ${m}`);
  process.exitCode = 1;
};

if (!s.apiKey) {
  bad("RESEND_API_KEY가 없습니다 (.env.local 또는 Vercel Environment Variables)");
  process.exit(1);
}
const resend = new Resend(s.apiKey);

if (s.segmentId) {
  const { error } = await resend.segments.get(s.segmentId);
  if (error) bad(`Segment를 찾지 못했습니다 (${error.name}). RESEND_AUDIENCE_ID를 확인하세요`);
  else ok("구독자 Segment 확인");
} else bad("RESEND_AUDIENCE_ID(Segment ID)가 없습니다");

const fromEmail = (process.env.NEWSLETTER_FROM_EMAIL || newsletterConfig.newsletterFromEmail || "").trim();
const domains = await resend.domains.list();
if (domains.error) bad(`도메인 목록을 읽지 못했습니다 (${domains.error.name}). 발송 권한이 있는 키인지 확인하세요`);
else if (!fromEmail) bad("발신 주소(NEWSLETTER_FROM_EMAIL)가 없습니다");
else {
  const host = fromEmail.split("@")[1]?.toLowerCase() ?? "";
  const d = domains.data.data.find((x) => host === x.name || host.endsWith(`.${x.name}`));
  if (!d) bad("발신 주소의 도메인이 Resend에 등록되어 있지 않습니다");
  else if (d.status !== "verified") bad(`발신 도메인이 아직 인증되지 않았습니다 (상태: ${d.status})`);
  else ok("발신 도메인 인증 확인");
}
for (const p of s.problems.filter((p) => p.includes("vercel.app"))) bad(p);

const key = newsletterConfig.interestsPropertyKey;
const props = await resend.contactProperties.list();
if (props.error) bad(`연락처 속성을 읽지 못했습니다 (${props.error.name})`);
else if (props.data.data.some((p) => p.key === key)) ok(`연락처 속성 '${key}' 확인`);
else if (args.apply) {
  const { error } = await resend.contactProperties.create({ key, type: "string", fallbackValue: "" });
  if (error) bad(`연락처 속성 '${key}'를 만들지 못했습니다 (${error.name})`);
  else ok(`연락처 속성 '${key}'를 만들었습니다`);
} else bad(`연락처 속성 '${key}'가 없습니다. --apply로 만드세요 (없으면 구독 신청이 실패합니다)`);
