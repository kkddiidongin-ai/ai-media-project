#!/usr/bin/env node
/**
 * 뉴스레터 메일 미리보기 (외부로 아무것도 보내지 않는다)
 *
 *   npm run newsletter:preview                    # 최신 호
 *   npm run newsletter:preview -- --date 2026-10-05
 *   npm run newsletter:preview -- --cases         # 점검용 대표 사례 묶음 (긴 제목, 단신 많은 날, 심층 메인, 관련 기사 없음 …)
 *   npm run newsletter:preview -- --edition 2026-10-06   # 편집 호 (newsletter/editions/<id>.json)
 *
 * 결과: ingest/log/newsletter-preview/<이름>.html · .txt, 그리고 여러 폭으로 나란히 보는 index.html
 */
import fs from "node:fs";
import path from "node:path";
import { ROOT, composeIssue, esc, loadConfig, loadEdition, loadIssues, loadStories, parseArgs, renderEditionEmail, renderIssueEmail } from "./lib.mjs";

const args = parseArgs(process.argv.slice(2));
const config = await loadConfig();
const stories = loadStories();
const issues = loadIssues(stories);
const OUT = path.join(ROOT, "ingest/log/newsletter-preview");
fs.mkdirSync(OUT, { recursive: true });

/** 점검용 사례 고르기: 실제 호 가운데 조건에 맞는 것 */
function pickCases() {
  const info = issues.map((i) => ({ i, p: composeIssue(i, stories) }));
  const cases = [];
  const add = (name, desc, found) => found && !cases.some((c) => c.name === name) && cases.push({ name, desc, issue: found.i ?? found });
  add("latest", "최신 호", info[0]);
  add("long-headline", "메인 제목이 가장 긴 호", [...info].sort((a, b) => b.i.stories[0].title.length - a.i.stories[0].title.length)[0]);
  add(
    "many-short",
    "단신(SHORT)이 가장 많은 호",
    [...info].sort((a, b) => b.i.stories.filter((s) => s.editorialDepth === "short").length - a.i.stories.filter((s) => s.editorialDepth === "short").length)[0],
  );
  add("deep-main", "메인이 심층(DEEP)인 최신 호", info.find((x) => x.i.stories[0].editorialDepth === "deep"));
  add("overflow", "8건을 넘어 '더 보기'가 붙는 호", info.find((x) => x.p.moreHidden > 0));
  add("single", "기사가 1건뿐인 호 (오늘의 AI·놓치면 아쉬운 변화 숨김)", info.find((x) => x.i.stories.length === 1));
  add("no-related", "더 읽어보기가 없는 호", info.find((x) => x.p.related.length === 0));
  add("no-checked", "AI마중이 확인한 것이 없는 호 (섹션 숨김)", info.find((x) => x.p.checked.length === 0));
  return cases;
}

let targets;
if (typeof args.edition === "string") targets = [{ name: `edition-${args.edition}`, desc: `편집 호 ${args.edition}`, edition: loadEdition(args.edition) }];
else if (args.cases) targets = pickCases();
else {
  const date = typeof args.date === "string" ? args.date : issues[0].date;
  const issue = issues.find((i) => i.date === date);
  if (!issue) {
    console.error(`${date} 호가 없습니다.`);
    process.exit(1);
  }
  targets = [{ name: date, desc: `${date} 호`, issue }];
}

const rows = [];
for (const t of targets) {
  if (t.edition) {
    const mail = renderEditionEmail(t.edition, { mode: "preview", allStories: stories, config });
    fs.writeFileSync(path.join(OUT, `${t.name}.html`), mail.html);
    fs.writeFileSync(path.join(OUT, `${t.name}.txt`), `제목: ${mail.subject}\n프리헤더: ${mail.preheader}\n\n${mail.text}\n`);
    rows.push({ ...t, issue: { date: t.edition.id }, mail });
    console.log(`${t.name}  ${(mail.html.length / 1024).toFixed(1)}KB\n  제목: ${mail.subject}\n  프리헤더: ${mail.preheader}`);
    continue;
  }
  const mail = renderIssueEmail(t.issue, { mode: "preview", allStories: stories, config });
  fs.writeFileSync(path.join(OUT, `${t.name}.html`), mail.html);
  fs.writeFileSync(path.join(OUT, `${t.name}.txt`), `제목: ${mail.subject}\n프리헤더: ${mail.preheader}\n\n${mail.text}\n`);
  const p = mail.parts;
  rows.push({ ...t, mail });
  console.log(
    `${t.name.padEnd(14)} ${t.issue.date}  ${String(t.issue.stories.length).padStart(2)}건  오늘의AI ${p.today.length} · 놓치면 ${p.more.length}${p.moreHidden ? `(+${p.moreHidden})` : ""} · 확인 ${p.checked.length} · 더읽기 ${p.related.length}  ${(mail.html.length / 1024).toFixed(1)}KB`,
  );
  console.log(`${" ".repeat(15)}제목: ${mail.subject}`);
}

// 여러 폭으로 나란히 보기
// 구독 확인 메일 (이중 확인). 링크의 토큰 자리는 예시 값
{
  const { createJiti } = await import("jiti");
  const { renderConfirmEmail } = await createJiti(import.meta.url).import(path.join(ROOT, "src/lib/newsletterConfirmEmail.ts"));
  const mail = renderConfirmEmail(`${config.siteConfig.url}/newsletter/confirm/#token=PREVIEW_TOKEN`, config.newsletterConfig.confirmTokenTtlHours);
  fs.writeFileSync(path.join(OUT, "confirm-email.html"), mail.html);
  fs.writeFileSync(path.join(OUT, "confirm-email.txt"), `제목: ${mail.subject}\n\n${mail.text}\n`);
  rows.push({ name: "confirm-email", desc: "구독 확인 메일", issue: { date: "-" }, mail: { ...mail, preheader: "(확인 메일)" } });
  console.log(`confirm-email  구독 확인 메일  제목: ${mail.subject}`);
}

const widths = [375, 600, 680];
const index = `<!doctype html><html lang="ko"><meta charset="utf-8"><title>AI마중 메일 미리보기</title>
<body style="margin:0;padding:20px;background:#333;font-family:sans-serif;color:#eee">
<h1 style="font-size:18px">AI마중 메일 미리보기 (${rows.length})</h1>
${rows
  .map(
    (r) => `<section style="margin:0 0 40px"><h2 style="font-size:15px">${esc(r.name)} — ${esc(r.desc)} · ${r.issue.date}</h2>
<p style="font-size:13px;color:#bbb">제목: ${esc(r.mail.subject)}<br>프리헤더: ${esc(r.mail.preheader)}</p>
<div style="display:flex;gap:16px;align-items:flex-start;overflow-x:auto">${widths
      .map((w) => `<figure style="margin:0"><figcaption style="font-size:12px;color:#bbb">${w}px</figcaption><iframe src="${esc(r.name)}.html" width="${w}" height="1400" style="border:1px solid #555;background:#fff"></iframe></figure>`)
      .join("")}</div></section>`,
  )
  .join("\n")}
</body></html>`;
fs.writeFileSync(path.join(OUT, "index.html"), index);
console.log(`\n→ ${path.relative(ROOT, path.join(OUT, "index.html"))}`);
