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
//
// 두 가지 입력이 같은 렌더러(renderModel)를 쓴다.
// 1) 자동 호: 날짜별 호(issue)에서 그대로 만든다 (buildIssueModel)
// 2) 편집 호(edition): newsletter/editions/<id>.json에 메일용으로 다듬은 문장을 두고, 기사 데이터와 연결해 만든다 (buildEditionModel)

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
  band: "#f4f2ed",
};
const FONT = "-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Malgun Gothic','Noto Sans KR',sans-serif";
const TEXT = `font-family:${FONT};word-break:keep-all;overflow-wrap:break-word;`;

const siteBase = (config) => config.siteConfig.url.replace(/\/$/, "");
const storyLink = (config, slug) => `${siteBase(config)}/stories/${slug}/`;

/** 자동 호 → 메일 모델 */
export function buildIssueModel(issue, opts) {
  const { categoryLabels } = opts.config;
  const site = siteBase(opts.config);
  const parts = composeIssue(issue, opts.allStories);
  const { main, today, more, moreHidden, checked, point, related } = parts;
  const url = (s) => storyLink(opts.config, s.slug);
  const webUrl = `${site}/newsletters/${issue.date}/`;
  return {
    subject: opts.subject || defaultSubject(issue),
    preheader: opts.preheader || defaultPreheader(issue),
    dateLine: `${koreanDate(issue.date)} · ${issue.stories.length}건`,
    webUrl,
    intro: [],
    today: today.map((s) => ({ title: s.title, url: url(s) })),
    main: {
      label: categoryLabels[main.category]?.ko ?? "",
      title: main.title,
      url: url(main),
      body: [main.editorialDepth === "deep" && main.lead ? main.lead : main.summary],
      facts: (main.facts ?? []).slice(0, 3),
      keyNumbers: [],
      point: null,
      cta: "기사 전체 읽기 →",
    },
    more: more.map((s) => ({ title: s.title, url: url(s), lines: [s.summary] })),
    moreOverflow: moreHidden > 0 ? { count: moreHidden, url: webUrl } : null,
    checked: checked.map((s) => ({ title: s.title, url: url(s), summary: s.summary })),
    point: { heading: "📌 AI마중 POINT", paragraphs: [point] },
    related: related.map((s) => ({ title: s.title, url: url(s), date: s.eventDate })),
    parts,
  };
}

// ---------- 편집 호 (edition) ----------

export const EDITIONS_DIR = path.join(ROOT, "newsletter/editions");

export function loadEdition(id) {
  const p = path.join(EDITIONS_DIR, `${id}.json`);
  if (!/^[\w-]+$/.test(String(id)) || !fs.existsSync(p)) throw new Error(`편집 호 ${id}가 없습니다 (newsletter/editions/${id}.json)`);
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

/** 편집 호가 가리키는 기사 slug 전체 */
export function editionSlugs(edition) {
  return [edition.main.slug, ...(edition.more ?? []).map((m) => m.slug), ...(edition.checked ?? []).map((m) => m.slug), ...(edition.readMore ?? []).map((m) => m.slug)];
}

/**
 * 편집 호 → 메일 모델. 모든 slug가 실제 기사여야 하고, 기사들은 webIssueDate 호에 들어 있어야 한다.
 * 문장은 편집 호 파일의 것을 쓰고, 제목·분류·링크는 기사 데이터에서 가져온다.
 */
export function buildEditionModel(edition, opts) {
  const { categoryLabels } = opts.config;
  const site = siteBase(opts.config);
  const bySlug = new Map(opts.allStories.map((s) => [s.slug, s]));
  const get = (slug) => {
    const s = bySlug.get(slug);
    if (!s) throw new Error(`편집 호 ${edition.id}: 없는 기사 ${slug}`);
    if (edition.webIssueDate && s.eventDate !== edition.webIssueDate) throw new Error(`편집 호 ${edition.id}: ${slug}는 ${edition.webIssueDate} 호 기사가 아님`);
    return s;
  };
  const main = get(edition.main.slug);
  // 웹에서 보기: 이 편집 호의 웹 버전 (/newsletters/<발행일>/). 기사들이 속한 날짜별 호(webIssueDate)와 다르다
  const webUrl = `${site}/newsletters/${edition.id}/`;
  return {
    subject: opts.subject || edition.subject,
    preheader: opts.preheader || edition.preheader,
    dateLine: edition.dateLine,
    webUrl,
    intro: edition.intro ?? [],
    today: [],
    main: {
      label: categoryLabels[main.category]?.ko ?? "",
      title: edition.main.title || main.title,
      url: storyLink(opts.config, main.slug),
      body: edition.main.body,
      facts: edition.main.facts ?? [],
      keyNumbers: edition.main.keyNumbers ?? [],
      point: edition.main.point ?? null,
      cta: edition.main.cta || "전체 내용 보기 →",
    },
    more: (edition.more ?? []).map((m) => {
      const s = get(m.slug);
      return { title: m.title || s.title, url: storyLink(opts.config, s.slug), lines: [m.change], why: m.why };
    }),
    moreOverflow: null,
    checked: (edition.checked ?? []).map((m) => {
      const s = get(m.slug);
      return { title: s.title, url: storyLink(opts.config, s.slug), summary: m.summary };
    }),
    point: edition.dayPoint
      ? { heading: "📌 오늘의 흐름", fact: edition.dayPoint.fact, opinion: edition.dayPoint.opinion }
      : { heading: "📌 AI마중 POINT", paragraphs: [edition.main.point] },
    related: (edition.readMore ?? []).map((m) => {
      const s = get(m.slug);
      return { title: s.title, url: storyLink(opts.config, s.slug), date: s.eventDate };
    }),
    parts: null,
  };
}

/**
 * 메일 모델 → HTML·텍스트
 * HTML: 표 레이아웃 + 인라인 CSS, 폭 640px(모바일 100%), JavaScript·이미지 없음.
 * 수신거부: 실제 발송(broadcast)은 Resend가 구독자별 링크로 바꾸는 {{{RESEND_UNSUBSCRIBE_URL}}}, 미리보기·테스트는 안내 페이지.
 */
export function renderModel(model, opts) {
  const { siteConfig, newsletterConfig } = opts.config;
  const site = siteBase(opts.config);
  const archiveUrl = `${site}/newsletters/`;
  const unsubscribeUrl = opts.mode === "broadcast" ? "{{{RESEND_UNSUBSCRIBE_URL}}}" : `${site}/newsletter/unsubscribe/`;
  const operatorInfo = process.env.NEWSLETTER_OPERATOR_INFO || newsletterConfig.newsletterOperatorInfo;
  const { subject, preheader, main } = model;

  const h2 = (label) => `<h2 style="${TEXT}margin:0 0 14px;font-size:17px;line-height:1.4;font-weight:800;color:${C.ink};">${label}</h2>`;
  // 섹션 사이: 얇은 종이색 띠로 나눠 한 편의 긴 글처럼 보이지 않게 (카드·새 색 없이)
  const divider = `<tr><td style="height:8px;line-height:8px;font-size:0;background:${C.band};border-top:1px solid ${C.paperLine};border-bottom:1px solid ${C.paperLine};">&nbsp;</td></tr>`;
  const section = (inner, { top = true } = {}) => `${top ? divider : ""}<tr><td class="px" style="padding:28px 36px 4px;">${inner}</td></tr>`;
  const link = (href, label, style = "") => `<a href="${esc(href)}" style="color:${C.accent};text-decoration:underline;${style}">${label}</a>`;
  const para = (t, size = "15.5px", color = C.inkSoft, margin = "0 0 14px") => `<p style="${TEXT}margin:${margin};font-size:${size};line-height:1.75;color:${color};">${esc(t)}</p>`;
  // 핵심 숫자: 숫자는 크게(초록), 조건은 작게. 표 + 인라인 CSS만
  const keyNumbers = (items) =>
    `<p style="${TEXT}margin:6px 0 4px;font-size:13px;font-weight:800;color:${C.muted};">핵심 숫자</p>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;border-top:2px solid ${C.accent};">${items
      .map(
        (k) =>
          `<tr><td style="padding:12px 0 11px;border-bottom:1px solid ${C.paperLine};">` +
          `<p style="${TEXT}margin:0;font-size:24px;line-height:1.3;font-weight:800;color:${C.accent};letter-spacing:-0.3px;">${esc(k.value)}</p>` +
          `<p style="${TEXT}margin:4px 0 0;font-size:13px;line-height:1.6;color:${C.muted};">${esc(k.label)}</p></td></tr>`,
      )
      .join("")}</table>`;
  const pointBox = (heading, inner) =>
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;"><tr><td style="padding:18px 20px;border-radius:8px;background:${C.accentSoft};border-left:4px solid ${C.accent};">` +
    `<p style="${TEXT}margin:0 0 8px;font-size:15px;font-weight:800;color:${C.accent};">${heading}</p>${inner}</td></tr></table>`;

  const blocks = [];
  let first = true;
  const push = (inner) => {
    blocks.push(section(inner, { top: !first }));
    first = false;
  };

  if (model.intro.length) push(model.intro.map((t, i) => para(t, "16px", C.ink, i === model.intro.length - 1 ? "0 0 22px" : "0 0 12px")).join(""));

  if (model.today.length) {
    push(
      h2("☀️ 오늘의 AI") +
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${model.today
          .map(
            (s, i) =>
              `<tr><td valign="top" width="26" style="${TEXT}padding:0 0 10px;font-size:13px;line-height:22px;color:${C.muted};font-weight:700;">${i + 1}.</td>` +
              `<td style="${TEXT}padding:0 0 10px;font-size:15px;line-height:22px;"><a href="${esc(s.url)}" style="color:${C.ink};text-decoration:none;font-weight:700;">${esc(s.title)}</a></td></tr>`,
          )
          .join("")}</table>`,
    );
  }

  push(
    h2("🔥 오늘의 메인") +
      (main.label ? `<p style="${TEXT}margin:0 0 6px;font-size:12px;line-height:1.4;font-weight:800;letter-spacing:0.06em;color:${C.accent};">${esc(main.label)}</p>` : "") +
      `<h3 style="${TEXT}margin:0 0 12px;font-size:21px;line-height:1.45;font-weight:800;color:${C.ink};"><a href="${esc(main.url)}" style="color:${C.ink};text-decoration:none;">${esc(main.title)}</a></h3>` +
      main.body.map((t) => para(t)).join("") +
      (main.facts.length
        ? `<p style="${TEXT}margin:4px 0 8px;font-size:13px;font-weight:800;color:${C.muted};">핵심 사실</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;">${main.facts
            .map(
              (f) =>
                `<tr><td valign="top" width="18" style="${TEXT}padding:0 0 8px;font-size:15px;line-height:1.7;color:${C.accent};">•</td><td style="${TEXT}padding:0 0 8px;font-size:15px;line-height:1.7;color:${C.ink};">${esc(f)}</td></tr>`,
            )
            .join("")}</table>`
        : "") +
      (main.keyNumbers.length ? keyNumbers(main.keyNumbers) : "") +
      (main.point ? pointBox("이 뉴스의 POINT", para(main.point, "15px", C.ink, "0")) : "") +
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;"><tr><td style="border-radius:8px;background:${C.accent};"><a href="${esc(main.url)}" style="${TEXT}display:inline-block;padding:11px 18px;font-size:14px;font-weight:800;color:#ffffff;text-decoration:none;">${esc(main.cta)}</a></td></tr></table>`,
  );

  if (model.more.length) {
    push(
      h2("⚡ 놓치면 아쉬운 변화") +
        model.more
          .map(
            (s) =>
              `<div style="margin:0 0 20px;"><p style="${TEXT}margin:0 0 6px;font-size:15.5px;line-height:1.5;font-weight:800;"><a href="${esc(s.url)}" style="color:${C.ink};text-decoration:none;">${esc(s.title)}</a></p>` +
              s.lines.map((t) => para(t, "14.5px", C.inkSoft, "0 0 6px")).join("") +
              (s.why ? `<p style="${TEXT}margin:0 0 6px;font-size:14.5px;line-height:1.7;color:${C.ink};"><strong style="color:${C.accent};">왜 봐야 하나</strong> ${esc(s.why)}</p>` : "") +
              (s.why ? `<p style="${TEXT}margin:0;font-size:14px;">${link(s.url, "자세히 보기 →")}</p>` : "") +
              `</div>`,
          )
          .join("") +
        (model.moreOverflow ? `<p style="${TEXT}margin:0 0 20px;font-size:14px;">${link(model.moreOverflow.url, `같은 날 소식 ${model.moreOverflow.count}건 더 보기 →`)}</p>` : ""),
    );
  }

  if (model.checked.length) {
    push(
      h2("🧪 AI마중이 직접 확인했습니다") +
        model.checked
          .map(
            (s) =>
              `<p style="${TEXT}margin:0 0 6px;font-size:15.5px;line-height:1.5;font-weight:800;"><a href="${esc(s.url)}" style="color:${C.ink};text-decoration:none;">${esc(s.title)}</a></p>` +
              para(s.summary, "14.5px", C.inkSoft, "0 0 18px"),
          )
          .join(""),
    );
  }

  const pt = model.point;
  push(
    pointBox(
      pt.heading,
      pt.fact
        ? `<p style="${TEXT}margin:0 0 4px;font-size:12.5px;font-weight:800;color:${C.muted};">확인된 사실</p>${para(pt.fact, "15px", C.ink, "0 0 12px")}` +
            `<p style="${TEXT}margin:0 0 4px;font-size:12.5px;font-weight:800;color:${C.muted};">AI마중의 해석</p>${para(pt.opinion, "15px", C.ink, "0")}`
        : pt.paragraphs.map((t, i) => para(t, "15px", C.ink, i === pt.paragraphs.length - 1 ? "0" : "0 0 10px")).join(""),
    ),
  );

  if (model.related.length) {
    push(
      h2("📚 더 읽어보기") +
        model.related
          .map(
            (s) =>
              `<p style="${TEXT}margin:0 0 12px;font-size:14.5px;line-height:1.6;"><a href="${esc(s.url)}" style="color:${C.ink};text-decoration:underline;">${esc(s.title)}</a> <span style="color:${C.muted};font-size:12.5px;">${esc(s.date.replaceAll("-", "."))}</span></p>`,
          )
          .join("") +
        `<div style="height:12px;line-height:12px;">&nbsp;</div>`,
    );
  }

  const footerLink = (href, label) => `<a href="${esc(href)}" style="color:${C.nightText};text-decoration:underline;">${label}</a>`;
  const sep = `<span style="color:${C.nightMuted};"> · </span>`;
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
  <p style="${TEXT}margin:14px 0 0;font-size:13px;line-height:1.6;color:${C.nightText};"><strong>${esc(model.dateLine)}</strong>
  <span style="color:${C.nightMuted};">&nbsp;|&nbsp;</span>${footerLink(model.webUrl, "웹에서 보기")}${sep}${footerLink(archiveUrl, "지난 호")}</p>
</td></tr>
<tr><td style="background:${C.paper};border-radius:10px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${blocks.join("\n")}
</table>
</td></tr>
<tr><td class="px" style="padding:26px 36px 0;">
  <p style="${TEXT}margin:0;font-size:15px;line-height:1.5;font-weight:800;color:#ffffff;">AI마중</p>
  <p style="${TEXT}margin:2px 0 10px;font-size:13px;line-height:1.6;color:${C.nightMuted};">${esc(siteConfig.descriptor)}</p>
  <p style="${TEXT}margin:0 0 14px;font-size:13px;line-height:1.7;color:${C.nightText};">${esc(siteConfig.intro)}</p>
  <p style="${TEXT}margin:0 0 12px;font-size:13px;line-height:1.7;color:${C.nightText};">${footerLink(site + "/", "AI마중 웹사이트")}${sep}${footerLink(archiveUrl, "지난 뉴스레터 보기")}${sep}${footerLink(unsubscribeUrl, "구독 해지")}</p>
  <p style="${TEXT}margin:0;font-size:12px;line-height:1.7;color:${C.nightMuted};">이 메일은 AI마중 뉴스레터 구독을 신청하고 확인한 분께 보내드립니다. 모든 소식은 공식 원문을 확인해 정리했습니다.${operatorInfo ? `<br>${esc(operatorInfo)}` : ""}</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>
`;

  // 텍스트 버전 (HTML을 못 보는 메일 앱용)
  const lines = [`AI마중 — ${siteConfig.descriptor}`, model.dateLine, `웹에서 보기: ${model.webUrl}`, ""];
  if (model.intro.length) lines.push(...model.intro, "");
  if (model.today.length) lines.push("☀️ 오늘의 AI", ...model.today.map((s, i) => `${i + 1}. ${s.title}`), "");
  lines.push("🔥 오늘의 메인", main.title, ...main.body);
  if (main.facts.length) lines.push("", "핵심 사실", ...main.facts.map((f) => `- ${f}`));
  if (main.keyNumbers.length) lines.push("", "핵심 숫자", ...main.keyNumbers.map((k) => `- ${k.value}: ${k.label}`));
  if (main.point) lines.push("", "이 뉴스의 POINT", main.point);
  lines.push(`${main.cta.replace(/\s*→$/, "")}: ${main.url}`, "");
  if (model.more.length) {
    lines.push("⚡ 놓치면 아쉬운 변화");
    for (const s of model.more) {
      lines.push(`- ${s.title}`, ...s.lines.map((t) => `  ${t}`));
      if (s.why) lines.push(`  왜 봐야 하나: ${s.why}`);
      lines.push(`  ${s.url}`);
    }
    if (model.moreOverflow) lines.push(`같은 날 소식 ${model.moreOverflow.count}건 더 보기: ${model.moreOverflow.url}`);
    lines.push("");
  }
  if (model.checked.length) lines.push("🧪 AI마중이 직접 확인했습니다", ...model.checked.map((s) => `- ${s.title} ${s.url}`), "");
  if (pt.fact) lines.push(pt.heading, `[확인된 사실] ${pt.fact}`, `[AI마중의 해석] ${pt.opinion}`, "");
  else lines.push(pt.heading, ...pt.paragraphs, "");
  if (model.related.length) lines.push("📚 더 읽어보기", ...model.related.map((s) => `- ${s.title} ${s.url}`), "");
  lines.push("—", "AI마중", siteConfig.descriptor, siteConfig.intro, "", `AI마중 웹사이트: ${site}/`, `지난 뉴스레터 보기: ${archiveUrl}`, `구독 해지: ${unsubscribeUrl}`);
  if (operatorInfo) lines.push(operatorInfo);

  return { subject, preheader, html, text: lines.join("\n"), parts: model.parts };
}

/**
 * @param {{date:string, stories:any[]}} issue
 * @param {{mode:"preview"|"test"|"broadcast", subject?:string, preheader?:string, allStories:any[], config:any}} opts
 */
export function renderIssueEmail(issue, opts) {
  return renderModel(buildIssueModel(issue, opts), opts);
}

/** 편집 호 렌더링 (opts는 renderIssueEmail과 같다) */
export function renderEditionEmail(edition, opts) {
  return renderModel(buildEditionModel(edition, opts), opts);
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
