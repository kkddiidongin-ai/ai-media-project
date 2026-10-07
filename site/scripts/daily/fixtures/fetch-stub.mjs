// 시험용: node --import 로 미리 불러 fetch를 고정 응답으로 바꾼다 (외부 접속 없음)
// DAILY_FETCH_FIXTURES = { "<url>": { "status": 200, "body": "..." } } 를 담은 JSON 파일 경로
import fs from "node:fs";
const map = JSON.parse(fs.readFileSync(process.env.DAILY_FETCH_FIXTURES, "utf8"));
globalThis.fetch = async (input) => {
  const url = String(input);
  const hit = map[url] ?? (url.endsWith("/robots.txt") ? { status: 404, body: "" } : { status: 599, body: "no fixture" });
  return new Response(hit.body, { status: hit.status, headers: { "content-type": "text/html" } });
};
