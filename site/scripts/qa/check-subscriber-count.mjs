#!/usr/bin/env node
/**
 * 구독자 수 카드 점검 (npm run qa:subscribers, `npm run build` 뒤에 실행)
 * 확인되지 않은 지정값(verified: false)이 운영용 빌드 결과(out/)에 들어가지 않았는지 본다.
 *   - 일반 빌드: 카드·숫자가 out/ 어디에도 없어야 한다
 *   - AIMAJUNG_SUBSCRIBER_PREVIEW=true 빌드(미리보기용): 홈에만 카드가 있어야 한다 — 이 빌드는 운영에 배포하지 않는다
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const jiti = createJiti(import.meta.url);
const { subscriberCountConfig, formatSubscriberCount } = await jiti.import(path.join(ROOT, "src/config/subscribers.ts"));
const OUT = path.join(ROOT, "out");
if (!fs.existsSync(path.join(OUT, "index.html"))) {
  console.error("out/index.html 없음 — 먼저 npm run build");
  process.exit(1);
}
const shown = formatSubscriberCount(subscriberCountConfig.value);
// HTML은 "187,632<!-- -->명"처럼 쪼개질 수 있어 숫자만으로도 찾는다
const needles = [shown, String(subscriberCountConfig.value), `aria-label="구독자 수"`];
const hits = [];
const walk = (d) => {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name);
    if (f.isDirectory()) walk(p);
    else if (/\.(html|txt|js|json)$/.test(f.name)) {
      const s = fs.readFileSync(p, "utf8");
      if (needles.some((n) => s.includes(n))) hits.push(path.relative(OUT, p).replace(/\\/g, "/"));
    }
  }
};
walk(OUT);
const preview = process.env.AIMAJUNG_SUBSCRIBER_PREVIEW === "true";
const problems = [];
if (subscriberCountConfig.verified) console.log("verified: true — 확인된 값으로 표시합니다");
else if (!preview && hits.length) problems.push(`확인되지 않은 구독자 수가 운영용 빌드에 있음: ${hits.slice(0, 5).join(", ")}`);
else if (preview && !hits.includes("index.html")) problems.push("미리보기 빌드인데 홈에 카드가 없음");
else if (preview && hits.some((h) => !/^index\.(html|txt)$/.test(h) && !h.startsWith("_next/"))) problems.push(`홈 밖에 카드가 있음: ${hits.join(", ")}`);
if (problems.length) {
  console.error("FAIL — " + problems.join("\n"));
  process.exit(1);
}
console.log(`OK — 구독자 수 카드 ${preview ? `미리보기 빌드: 홈에 표시 (${shown}명)` : subscriberCountConfig.verified ? "표시" : "운영용 빌드에 없음 (verified: false)"}`);
