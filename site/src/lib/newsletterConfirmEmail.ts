import { siteConfig } from "../config/site.js";

/**
 * 구독 확인 메일 (transactional). 뉴스레터 본문·광고 문구 없이 확인 버튼만 담는다.
 * 표 레이아웃 + 인라인 CSS, 폭 560px(모바일 100%), JavaScript·이미지 없음. 텍스트 버전을 함께 만든다.
 */

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const FONT = "-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Malgun Gothic','Noto Sans KR',sans-serif";
const T = `font-family:${FONT};word-break:keep-all;overflow-wrap:break-word;`;

export const CONFIRM_SUBJECT = "AI마중 뉴스레터 구독을 확인해 주세요";

export function renderConfirmEmail(confirmUrl: string, ttlHours: number) {
  const site = siteConfig.url.replace(/\/$/, "");
  const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light">
<title>${esc(CONFIRM_SUBJECT)}</title>
<style>
  @media only screen and (max-width: 560px) {
    .container { width: 100% !important; }
    .px { padding-left: 22px !important; padding-right: 22px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:#151513;-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:#151513;">버튼을 눌러 이메일 주소를 확인하면 구독이 완료됩니다.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#151513;">
<tr><td align="center" style="padding:28px 10px 36px;">
<table role="presentation" class="container" width="560" cellpadding="0" cellspacing="0" border="0" style="width:560px;max-width:560px;">
<tr><td class="px" style="padding:4px 32px 18px;">
  <p style="${T}margin:0;font-size:24px;line-height:1.3;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">AI마중</p>
</td></tr>
<tr><td class="px" style="background:#ffffff;border-radius:10px;padding:32px 32px 30px;">
  <p style="${T}margin:0 0 14px;font-size:17px;line-height:1.6;font-weight:700;color:#1d1c1a;">AI마중 뉴스레터 구독을 신청하셨습니다.</p>
  <p style="${T}margin:0 0 24px;font-size:15.5px;line-height:1.75;color:#3f3d39;">아래 버튼을 눌러 이메일 주소를 확인하면 구독이 완료됩니다.</p>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 26px;"><tr><td style="border-radius:8px;background:#2f5d50;">
    <a href="${esc(confirmUrl)}" style="${T}display:inline-block;padding:14px 26px;font-size:16px;font-weight:800;color:#ffffff;text-decoration:none;">뉴스레터 구독 확인</a>
  </td></tr></table>
  <p style="${T}margin:0 0 8px;font-size:14px;line-height:1.7;color:#625f58;">본인이 신청하지 않았다면 이 메일을 무시하시면 됩니다. 확인하지 않으면 구독되지 않습니다.</p>
  <p style="${T}margin:0;font-size:14px;line-height:1.7;color:#625f58;">확인 링크는 ${ttlHours}시간이 지나면 만료됩니다.</p>
</td></tr>
<tr><td class="px" style="padding:22px 32px 0;">
  <p style="${T}margin:0;font-size:12.5px;line-height:1.7;color:#a39e93;">AI마중<br><a href="${esc(site)}/" style="color:#ebe7de;text-decoration:underline;">${esc(site.replace(/^https?:\/\//, ""))}</a></p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>
`;
  const text = [
    "AI마중",
    "",
    "AI마중 뉴스레터 구독을 신청하셨습니다.",
    "아래 링크를 열어 이메일 주소를 확인하면 구독이 완료됩니다.",
    "",
    `뉴스레터 구독 확인: ${confirmUrl}`,
    "",
    "본인이 신청하지 않았다면 이 메일을 무시하시면 됩니다. 확인하지 않으면 구독되지 않습니다.",
    `확인 링크는 ${ttlHours}시간이 지나면 만료됩니다.`,
    "",
    "AI마중",
    `${site}/`,
  ].join("\n");
  return { subject: CONFIRM_SUBJECT, html, text };
}
