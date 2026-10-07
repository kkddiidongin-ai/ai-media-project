/**
 * AI마중 뉴스레터 메일 만들기 (preview / test / send 스크립트 공통)
 *
 * 흐름: content/stories (기사) → 날짜별 호(issue) → 웹(/newsletters/<date>/) → 메일 HTML·텍스트
 * 웹 뉴스레터와 같은 데이터·같은 순서(사건 날짜 → priority → slug)를 쓴다. 메일만을 위한 별도 원고는 없다.
 *
 * 메일 HTML 원칙: 표(table) 레이아웃 + 인라인 CSS, 본문 폭 640px(모바일은 100%), JavaScript 없음,
 * 이미지 없이도 읽힌다. 수신거부 링크는 모든 메일에 넣는다.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const jiti = createJiti(import.meta.url);

export async function loadConfig() {
  const { siteConfig } = await jiti.import(path.join(ROOT, "src/config/site.ts"));
  const { categoryLabels } = await jiti.import(path.join(ROOT, "src/config/labels.ts"));
  const nl = await jiti.import(path.join(ROOT, "src/config/newsletter.ts"));
  return { siteConfig, categoryLabels, ...nl };
}

/** .env.local이 있으면 읽는다 (이미 설정된 환경변수는 덮어쓰지 않음). 값은 출력하지 않는다 */
export function loadEnvLocal() {
  const p = path.join(ROOT, ".env.local");
  if (fs.existsSync(p)) process.loadEnvFile(p);
}

export function loadStories() {
  const dir = path.join(ROOT, "content/stories");
  const all = [];
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) all.push(...JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
  // src/lib/news.ts getStories()와 같은 순서
  return all.sort((a, b) => b.eventDate.localeCompare(a.eventDate) || a.priority - b.priority || a.slug.localeCompare(b.slug));
}

export function loadIssues(stories = loadStories()) {
  const map = new Map();
  for (const s of stories) {
    if (!map.has(s.eventDate)) map.set(s.eventDate, []);
    map.get(s.eventDate).push(s);
  }
  return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([date, list]) => ({ date, stories: list }));
}

// ---------- 문자열 도우미 ----------

export const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
export function koreanDate(d) {
  const [y, m, day] = d.split("-").map(Number);
  const w = WEEK[new Date(Date.UTC(y, m - 1, day)).getUTCDay()];
  return `${y}년 ${m}월 ${day}일 (${w})`;
}

/** 첫 문장 (없으면 글자 수로 자름) */
function firstSentence(text, max = 110) {
  const t = String(text ?? "").trim();
  const m = t.match(/^.+?(?:다\.|요\.|[.!?])(?=\s|$)/);
  const s = m ? m[0] : t;
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

// ---------- 호 → 메일 내용 ----------

const TODAY_MAX = 5;
const MORE_MAX = 8;
const RELATED_MAX = 3;

/**
 * 메일에 들어갈 내용을 고른다 (렌더링과 분리해 테스트하기 쉽게).
 * - 오늘의 AI: 2건 이상일 때 상위 5건 제목
 * - 오늘의 메인: priority 1순위 기사
 * - 놓치면 아쉬운 변화: 나머지 (최대 8건, 넘치면 웹으로)
 * - AI마중이 확인한 것: 직접 확인한 콘텐츠(contentType이 NEWS가 아닌 것)가 있을 때만
 * - POINT: 메인이 심층이면 point 섹션 첫 문단, 아니면 whyItMatters
 * - 더 읽어보기: 메인과 주제가 겹치는 지난 기사 (같은 호 제외, 최신순 3건)
 */
export function composeIssue(issue, allStories) {
  const [main, ...rest] = issue.stories;
  const today = issue.stories.length >= 2 ? issue.stories.slice(0, TODAY_MAX) : [];
  const more = rest.slice(0, MORE_MAX);
  const moreHidden = rest.length - more.length;
  const checked = issue.stories.filter((s) => s.contentType && s.contentType !== "NEWS");
  const pointSection = main.editorialDepth === "deep" ? (main.sections ?? []).find((x) => x.role === "point") : null;
  const point = pointSection?.paragraphs?.[0] ?? main.whyItMatters;
  const inIssue = new Set(issue.stories.map((s) => s.slug));
  const topics = new Set(main.topics);
  const related = allStories
    .filter((s) => !inIssue.has(s.slug) && s.eventDate < issue.date && s.topics.some((t) => topics.has(t)))
    .slice(0, RELATED_MAX);
  return { main, today, more, moreHidden, checked, point, related };
}

export function defaultSubject(issue) {
  return `🤖 ${issue.stories[0].title} — AI마중`;
}

export function defaultPreheader(issue) {
  const [main, ...rest] = issue.stories;
  const tail = rest.length ? ` 외 ${rest.length}건의 변화도 함께 정리했습니다.` : "";
  return `${firstSentence(main.summary, 90)}${tail}`;
}

// ---------- 렌더링 ----------

const C = {
  night: "#151513",
  deep: "#0d0d0c",
  line: "#2b2a27",
  nightText: "#ebe7de",
  nightMuted: "#a39e93",
  nightAccent: "#8cc4a8",
  paper: "#ffffff",
  ink: "#1d1c1a",
  inkSoft: "#3f3d39",
  muted: "#625f58",
  paperLine: "#e2ded5",
  accent: "#2f5d50",
  accentSoft: "#e6efe9",
};
const FONT = "-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Malgun Gothic','Noto Sans KR',sans-serif";
const TEXT = `font-family:${FONT};word-break:keep-all;overflow-wrap:break-word;`;

/**
 * @param {{date:string, stories:any[]}} issue
 * @param {{mode:"preview"|"test"|"broadcast", subject?:string, preheader?:string, allStories:any[], config:any}} opts
 * @returns {{subject:string, preheader:string, html:string, text:string, parts:object}}
 */
export function renderIssueEmail(issue, opts) {
  const { siteConfig, categoryLabels, newsletterConfig } = opts.config;
  const site = siteConfig.url.replace(/\/$/, "");
  const utm = (u) => u; // 추적 파라미터는 붙이지 않는다
  const storyUrl = (s) => utm(`${site}/stories/${s.slug}/`);
  const webUrl = `${site}/newsletters/${issue.date}/`;
  const archiveUrl = `${site}/newsletters/`;
  // 실제 발송(broadcast)에서는 Resend가 구독자별 수신거부 링크로 바꿔 넣는다
  const unsubscribeUrl = opts.mode === "broadcast" ? "{{{RESEND_UNSUBSCRIBE_URL}}}" : `${site}/newsletter/unsubscribe/`;
  const operatorInfo = process.env.NEWSLETTER_OPERATOR_INFO || newsletterConfig.newsletterOperatorInfo;

  const subject = opts.subject || defaultSubject(issue);
  const preheader = opts.preheader || defaultPreheader(issue);
  const parts = composeIssue(issue, opts.allStories);
  const { main, today, more, moreHidden, checked, point, related } = parts;
  const cat = (s) => categoryLabels[s.category]?.ko ?? "";

  const h2 = (label) =>
    `<h2 style="${TEXT}margin:0 0 14px;font-size:17px;line-height:1.4;font-weight:800;color:${C.ink};">${label}</h2>`;
  const section = (inner, { top = true } = {}) =>
    `<tr><td class="px" style="padding:28px 36px 4px;${top ? `border-top:1px solid ${C.paperLine};` : ""}">${inner}</td></tr>`;
  const link = (href, label, style = "") => `<a href="${esc(href)}" style="color:${C.accent};text-decoration:underline;${style}">${label}</a>`;

  const blocks = [];
  if (today.length) {
    blocks.push(
      section(
        h2("☀️ 오늘의 AI") +
          `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${today
            .map(
              (s, i) =>
                `<tr><td valign="top" width="26" style="${TEXT}padding:0 0 10px;font-size:13px;line-height:22px;color:${C.muted};font-weight:700;">${i + 1}.</td>` +
                `<td style="${TEXT}padding:0 0 10px;font-size:15px;line-height:22px;"><a href="${esc(storyUrl(s))}" style="color:${C.ink};text-decoration:none;font-weight:700;">${esc(s.title)}</a></td></tr>`,
            )
            .join("")}</table>`,
        { top: false },
      ),
    );
  }

  const mainBody = main.editorialDepth === "deep" && main.lead ? main.lead : main.summary;
  const facts = (main.facts ?? []).slice(0, 3);
  blocks.push(
    section(
      h2("🔥 오늘의 메인") +
        `<p style="${TEXT}margin:0 0 6px;font-size:12px;line-height:1.4;font-weight:800;letter-spacing:0.06em;color:${C.accent};">${esc(cat(main))}</p>` +
        `<h3 style="${TEXT}margin:0 0 12px;font-size:21px;line-height:1.45;font-weight:800;color:${C.ink};"><a href="${esc(storyUrl(main))}" style="color:${C.ink};text-decoration:none;">${esc(main.title)}</a></h3>` +
        `<p style="${TEXT}margin:0 0 14px;font-size:15.5px;line-height:1.75;color:${C.inkSoft};">${esc(mainBody)}</p>` +
        (facts.length
          ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;">${facts
              .map(
                (f) =>
                  `<tr><td valign="top" width="18" style="${TEXT}padding:0 0 8px;font-size:15px;line-height:1.7;color:${C.accent};">•</td><td style="${TEXT}padding:0 0 8px;font-size:15px;line-height:1.7;color:${C.ink};">${esc(f)}</td></tr>`,
              )
              .join("")}</table>`
          : "") +
        `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;"><tr><td style="border-radius:8px;background:${C.accent};"><a href="${esc(storyUrl(main))}" style="${TEXT}display:inline-block;padding:11px 18px;font-size:14px;font-weight:800;color:#ffffff;text-decoration:none;">기사 전체 읽기 →</a></td></tr></table>`,
      { top: today.length > 0 },
    ),
  );

  if (more.length) {
    blocks.push(
      section(
        h2("⚡ 놓치면 아쉬운 변화") +
          more
            .map(
              (s) =>
                `<div style="margin:0 0 18px;"><p style="${TEXT}margin:0 0 4px;font-size:15.5px;line-height:1.5;font-weight:800;"><a href="${esc(storyUrl(s))}" style="color:${C.ink};text-decoration:none;">${esc(s.title)}</a></p>` +
                `<p style="${TEXT}margin:0;font-size:14.5px;line-height:1.7;color:${C.inkSoft};">${esc(s.summary)}</p></div>`,
            )
            .join("") +
          (moreHidden > 0 ? `<p style="${TEXT}margin:0 0 20px;font-size:14px;">${link(webUrl, `같은 날 소식 ${moreHidden}건 더 보기 →`)}</p>` : ""),
      ),
    );
  }

  if (checked.length) {
    blocks.push(
      section(
        h2("🧪 AI마중이 확인한 것") +
          checked
            .map(
              (s) =>
                `<p style="${TEXT}margin:0 0 6px;font-size:15.5px;line-height:1.5;font-weight:800;"><a href="${esc(storyUrl(s))}" style="color:${C.ink};text-decoration:none;">${esc(s.title)}</a></p><p style="${TEXT}margin:0 0 18px;font-size:14.5px;line-height:1.7;color:${C.inkSoft};">${esc(s.summary)}</p>`,
            )
            .join(""),
      ),
    );
  }

  blocks.push(
    section(
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;"><tr><td style="padding:18px 20px;border-radius:8px;background:${C.accentSoft};border-left:4px solid ${C.accent};">` +
        `<p style="${TEXT}margin:0 0 8px;font-size:15px;font-weight:800;color:${C.accent};">📌 AI마중 POINT</p>` +
        `<p style="${TEXT}margin:0;font-size:15px;line-height:1.75;color:${C.ink};">${esc(point)}</p></td></tr></table>`,
    ),
  );

  if (related.length) {
    blocks.push(
      section(
        h2("📚 더 읽어보기") +
          related
            .map(
              (s) =>
                `<p style="${TEXT}margin:0 0 12px;font-size:14.5px;line-height:1.6;"><a href="${esc(storyUrl(s))}" style="color:${C.ink};text-decoration:underline;">${esc(s.title)}</a> <span style="color:${C.muted};font-size:12.5px;">${esc(s.eventDate.replaceAll("-", "."))}</span></p>`,
            )
            .join("") +
          `<div style="height:12px;line-height:12px;">&nbsp;</div>`,
      ),
    );
  }

  const footerLink = (href, label) => `<a href="${esc(href)}" style="color:${C.nightText};text-decoration:underline;">${label}</a>`;
  const html = `<!doctype html>
<html lang="ko" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light">
<title>${esc(subject)}</title>
<style>
  @media only screen and (max-width: 640px) {
    .container { width: 100% !important; }
    .px { padding-left: 20px !important; padding-right: 20px !important; }
  }
  a { color: ${C.accent}; }
</style>
</head>
<body style="margin:0;padding:0;background:${C.night};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.night};font-size:1px;line-height:1px;">${esc(preheader)}${"&#8204;&nbsp;".repeat(60)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.night};">
<tr><td align="center" style="padding:24px 10px 32px;">
<table role="presentation" class="container" width="640" cellpadding="0" cellspacing="0" border="0" style="width:640px;max-width:640px;">
<tr><td class="px" style="padding:8px 36px 22px;">
  <p style="${TEXT}margin:0;font-size:26px;line-height:1.3;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">AI마중</p>
  <p style="${TEXT}margin:4px 0 0;font-size:13.5px;line-height:1.5;color:${C.nightMuted};">${esc(siteConfig.descriptor)}</p>
  <p style="${TEXT}margin:14px 0 0;font-size:13px;line-height:1.6;color:${C.nightText};"><strong>${esc(koreanDate(issue.date))}</strong> · ${issue.stories.length}건
  <span style="color:${C.nightMuted};">&nbsp;|&nbsp;</span>${footerLink(webUrl, "웹에서 보기")}<span style="color:${C.nightMuted};"> · </span>${footerLink(archiveUrl, "지난 호")}</p>
</td></tr>
<tr><td style="background:${C.paper};border-radius:10px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${blocks.join("\n")}
</table>
</td></tr>
<tr><td class="px" style="padding:24px 36px 0;">
  <p style="${TEXT}margin:0 0 10px;font-size:13px;line-height:1.7;color:${C.nightText};">${footerLink(site + "/", "웹사이트")}<span style="color:${C.nightMuted};"> · </span>${footerLink(archiveUrl, "지난 뉴스레터")}<span style="color:${C.nightMuted};"> · </span>${footerLink(unsubscribeUrl, "수신거부")}</p>
  <p style="${TEXT}margin:0;font-size:12px;line-height:1.7;color:${C.nightMuted};">이 메일은 AI마중 뉴스레터 구독을 신청한 분께 보내드립니다. 모든 소식은 공식 원문을 확인해 정리했습니다.<br>${esc(siteConfig.tagline)}${operatorInfo ? `<br>${esc(operatorInfo)}` : ""}</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>
`;

  // 텍스트 버전 (HTML을 못 보는 메일 앱용)
  const lines = [`AI마중 — ${siteConfig.descriptor}`, `${koreanDate(issue.date)} · ${issue.stories.length}건`, `웹에서 보기: ${webUrl}`, ""];
  if (today.length) lines.push("☀️ 오늘의 AI", ...today.map((s, i) => `${i + 1}. ${s.title}`), "");
  lines.push("🔥 오늘의 메인", main.title, mainBody, ...facts.map((f) => `- ${f}`), `기사 전체 읽기: ${storyUrl(main)}`, "");
  if (more.length) {
    lines.push("⚡ 놓치면 아쉬운 변화");
    for (const s of more) lines.push(`- ${s.title}`, `  ${s.summary}`, `  ${storyUrl(s)}`);
    if (moreHidden > 0) lines.push(`같은 날 소식 ${moreHidden}건 더 보기: ${webUrl}`);
    lines.push("");
  }
  if (checked.length) lines.push("🧪 AI마중이 확인한 것", ...checked.map((s) => `- ${s.title} ${storyUrl(s)}`), "");
  lines.push("📌 AI마중 POINT", point, "");
  if (related.length) lines.push("📚 더 읽어보기", ...related.map((s) => `- ${s.title} ${storyUrl(s)}`), "");
  lines.push("—", `웹사이트: ${site}/`, `지난 뉴스레터: ${archiveUrl}`, `수신거부: ${unsubscribeUrl}`, siteConfig.tagline);
  if (operatorInfo) lines.push(operatorInfo);

  return { subject, preheader, html, text: lines.join("\n"), parts };
}

// ---------- 발송 설정 ----------

/**
 * 발송에 필요한 값을 모은다. 빠진 값은 problems에 담는다 (값 자체는 출력하지 않는다).
 * 발신 주소는 Resend에서 인증한 자체 도메인이어야 하며 vercel.app 주소는 막는다.
 */
export function sendSettings(env, newsletterConfig) {
  const problems = [];
  const apiKey = env.RESEND_API_KEY?.trim();
  const segmentId = (env.RESEND_SEGMENT_ID || env.RESEND_AUDIENCE_ID || newsletterConfig.resendAudienceId || "").trim();
  const fromEmail = (env.NEWSLETTER_FROM_EMAIL || newsletterConfig.newsletterFromEmail || "").trim();
  const replyTo = (env.NEWSLETTER_REPLY_TO || newsletterConfig.newsletterReplyTo || "").trim();
  const fromName = env.NEWSLETTER_FROM_NAME || newsletterConfig.newsletterFromName;
  if (!apiKey) problems.push("RESEND_API_KEY 없음");
  if (!segmentId) problems.push("RESEND_AUDIENCE_ID(Segment ID) 없음");
  if (!fromEmail) problems.push("발신 주소(NEWSLETTER_FROM_EMAIL / newsletterFromEmail) 없음");
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromEmail)) problems.push("발신 주소 형식 오류");
  else if (/@(.+\.)?vercel\.app$/i.test(fromEmail)) problems.push("발신 주소에 vercel.app 도메인은 쓸 수 없음 (자체 도메인 인증 필요)");
  return { problems, apiKey, segmentId, from: fromEmail ? `${fromName} <${fromEmail}>` : "", replyTo: replyTo || undefined };
}

export function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const [k, v] = a.slice(2).split("=");
    if (v !== undefined) out[k] = v;
    else if (argv[i + 1] && !argv[i + 1].startsWith("--")) out[k] = argv[++i];
    else out[k] = true;
  }
  return out;
}

/** 이메일을 로그에 남길 때 가린다 (ab***@example.com) */
export const maskEmail = (e) => String(e).replace(/^(.{0,2}).*@/, "$1***@");
