/**
 * 주간 뉴스레터 승인 · 발송 (사람이 직접 실행하는 명령에서만 쓴다. 예약 준비 workflow는 이 파일을 쓰지 않는다)
 *
 * 승인: 원고 해시 + 최종 QA + 발송 설정·법적 표기 + 구독자 상태(읽기) + 중복 발송 여부를 확인하고,
 *       승인하는 사람만 가진 비밀값(NEWSLETTER_APPROVAL_SECRET)으로 서명한다. PR merge·댓글·파일 수정만으로는 승인되지 않는다.
 * 발송: 서명이 맞고 승인 해시가 지금 원고와 같을 때만. 전체 발송은 Resend Broadcast 하나 (기존 newsletter:send와 같은 방식).
 *   - Broadcast API는 idempotency key를 받지 않는다 → Resend의 같은 이름 Broadcast를 먼저 찾아 중복을 막고,
 *     결과가 불확실하면(시간 초과·5xx) 다시 보내지 않고 '수동 확인'으로 남긴다 (--reconcile).
 *   - 테스트 주소 발송은 주소마다 따로 보내며 idempotency key를 쓴다 (같은 키로 재시도해도 한 번만 간다).
 *   - 받는 사람: 구독 해지자는 Resend가 Broadcast에서 뺀다. 그 전에 실제 연락처 목록으로 인원·해지·중복 주소·무료 한도를 확인한다.
 *
 * 모든 함수는 Resend 클라이언트를 인자로 받는다 (시험은 mock). 키·이메일 주소는 출력·기록하지 않는다.
 */
import fs from "node:fs";
import path from "node:path";
import { ROOT, alreadySent, listSegmentMembers, renderEditionEmail, resolveSegment, sendSettings, verifyBroadcast } from "./lib.mjs";
import {
  SENT_FILE,
  WEEKLY_DIR,
  approvalProblems,
  approvalSecretProblem,
  contentHash,
  fetchProduction,
  loadWeekly,
  loadWeeklyConfig,
  qaWeekly,
  recipientRef,
  redact,
  renderWeeklyReport,
  sendRequirements,
  shortHash,
  signApproval,
  usedSlugs,
  EDITIONS_DIR,
} from "./weekly.mjs";

export const LOG_DIR = path.join(ROOT, "ingest/log/newsletter-weekly"); // git 제외 (받는 사람 참조 기록)
export const broadcastPrefix = (id) => `AI마중 주간 ${id}`;
export const broadcastName = (id, hash) => `${broadcastPrefix(id)} (${shortHash(hash)})`;
const TEST_MAX = 5;

export class Stop extends Error {}
const readJson = (p, fb) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : fb);
const writeJson = (p, v) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(v, null, 2) + "\n");
};

/** 정해진 시간 안에 끝나지 않으면 TimeoutError (요청은 서버에서 계속 처리될 수 있다 = 결과 불확실) */
export function withTimeout(promise, ms) {
  let t;
  const timer = new Promise((_, reject) => {
    t = setTimeout(() => reject(Object.assign(new Error("시간 초과"), { name: "TimeoutError" })), ms);
  });
  return Promise.race([promise, timer]).finally(() => clearTimeout(t));
}

/**
 * 발송 API 결과 분류
 * - accepted: Resend가 받음 (실제 수신 여부는 별개 — 반송·스팸함은 Resend 대시보드/웹훅에서만 확인)
 * - rejected: 확실히 처리되지 않음 (429 요청 한도, 4xx 검증 오류) → 429만 재시도
 * - uncertain: 시간 초과·접속 오류·5xx → 서버가 처리했을 수 있으므로 같은 Broadcast를 다시 보내지 않는다
 */
export function classify(outcome) {
  if (outcome.thrown) return { kind: "uncertain", why: outcome.thrown.name === "TimeoutError" ? "시간 초과" : "접속 오류" };
  const e = outcome.result?.error;
  if (!e) return { kind: "accepted" };
  const code = Number(e.statusCode);
  if (code === 429) return { kind: "rejected", retry: true, why: "요청 한도(429)" };
  if (code >= 400 && code < 500) return { kind: "rejected", retry: false, why: `${e.name ?? "오류"} (${code})` };
  return { kind: "uncertain", why: `${e.name ?? "서버 오류"}${code ? ` (${code})` : ""}` };
}
async function call(fn, ms) {
  try {
    return { result: await withTimeout(fn(), ms) };
  } catch (thrown) {
    return { thrown };
  }
}

// ---------- Resend 읽기 ----------

/** 같은 edition ID로 만든 Broadcast (이름으로 찾는다). sent = 초안이 아닌 것(queued·sent 등) */
export async function findBroadcasts(resend, id) {
  const all = [];
  let after;
  for (let page = 0; page < 50; page++) {
    const r = await resend.broadcasts.list(after ? { limit: 100, after } : { limit: 100 });
    if (r.error) throw new Stop(`Resend Broadcast 목록 조회 실패: ${r.error.name}`);
    all.push(...r.data.data);
    if (!r.data.has_more || !r.data.data.length) break;
    after = r.data.data.at(-1).id;
  }
  const mine = all.filter((b) => typeof b.name === "string" && b.name.startsWith(broadcastPrefix(id)));
  return { sent: mine.filter((b) => b.status !== "draft"), drafts: mine.filter((b) => b.status === "draft") };
}

/** 계정 전체 연락처 수 (무료 한도 확인용). 목록을 끝까지 센다 */
async function countAllContacts(resend) {
  let n = 0;
  let after;
  for (let page = 0; page < 200; page++) {
    const r = await resend.contacts.list(after ? { limit: 100, after } : { limit: 100 });
    if (r.error) throw new Stop(`Resend 연락처 조회 실패: ${r.error.name}`);
    n += r.data.data.length;
    if (!r.data.has_more || !r.data.data.length) return n;
    after = r.data.data.at(-1).id;
  }
  throw new Stop("연락처가 너무 많아 끝까지 세지 못했습니다 — 발송하지 않습니다");
}

/**
 * 받는 사람 확인 (읽기만): Segment · 구독 중/해지 · 같은 주소 중복 · 무료 한도
 * @returns {{segment, members, subscribed:any[], unsubscribed:number, duplicates:number, totalContacts:number, problems:string[]}}
 */
export async function audienceCheck(resend, { segment, segmentName, fallbackId }, cfg) {
  let seg;
  try {
    seg = await resolveSegment(resend, { segment, segmentName, fallbackId });
  } catch (e) {
    throw new Stop(e.message);
  }
  let members;
  try {
    members = await listSegmentMembers(resend, seg.id);
  } catch (e) {
    throw new Stop(e.message);
  }
  const subscribed = members.filter((m) => m.unsubscribed === false);
  const unsubscribed = members.length - subscribed.length;
  const seen = new Set();
  let duplicates = 0;
  for (const m of subscribed) {
    const k = String(m.email).trim().toLowerCase();
    if (seen.has(k)) duplicates++;
    seen.add(k);
  }
  const totalContacts = await countAllContacts(resend);
  const problems = [];
  if (!subscribed.length) problems.push("구독 중인 받는 사람이 0명");
  if (duplicates) problems.push(`같은 이메일 주소가 ${duplicates}건 중복 — 정리 전까지 발송하지 않음`);
  if (totalContacts > cfg.freeContactLimit) problems.push(`연락처 ${totalContacts}명이 무료 한도 ${cfg.freeContactLimit}명을 넘음 — 유료 전환 없이 발송하지 않음 (NEWSLETTER_FREE_CONTACT_LIMIT)`);
  if (subscribed.length > cfg.freeContactLimit) problems.push(`받는 사람 ${subscribed.length}명이 무료 한도 ${cfg.freeContactLimit}명을 넘음`);
  return { segment: seg, members, subscribed, unsubscribed, duplicates, totalContacts, problems };
}

// ---------- 공통 ----------

function context({ id, dir, stories, config, env }) {
  const { paths, edition, state } = loadWeekly(id, dir);
  if (!state) throw new Stop(`${id} 호가 없습니다 (먼저 npm run newsletter:weekly -- --edition ${id})`);
  if (!edition) throw new Stop(`${id} 호에 원고가 없습니다 (상태 ${state.status})`);
  const cfg = loadWeeklyConfig(env);
  const hash = contentHash(edition);
  const operatorInfo = (env.NEWSLETTER_OPERATOR_INFO || config.newsletterConfig.newsletterOperatorInfo || "").trim() || null;
  return { paths, edition, state, cfg, hash, operatorInfo, mail: renderEditionEmail(edition, { mode: "broadcast", allStories: stories, config, operatorInfo }) };
}
/** 최종 QA: Production 사이트맵을 다시 읽고 지금 원고를 다시 검사한다 */
async function finalQa({ edition, state, cfg, stories, config, fetchImpl, dir, editionsDir }) {
  const production = await fetchProduction(config.siteConfig.url, fetchImpl);
  const used = usedSlugs({ editionsDir, weeklyDir: dir, exceptId: edition.id });
  return qaWeekly(edition, { stories, period: state.period, production, used, cfg, config, inPeriod: state.selection?.length ?? null });
}
function saveState(paths, state, { stories, config, env }) {
  writeJson(paths.state, state);
  fs.writeFileSync(paths.report, renderWeeklyReport({ edition: loadWeekly(state.id, path.dirname(paths.dir)).edition, state, stories, config, env }));
}
const sentRecords = (sentFile) => readJson(sentFile, []);

// ---------- 승인 ----------

/**
 * 편집자 승인. 통과하면 state.status = APPROVED + 서명. 이메일은 보내지 않는다 (Resend는 읽기만).
 * @param {{id:string, hashArg:string, approver:string, ackReview?:boolean, segment?:string, segmentName?:string, env, resend, stories, config, fetchImpl?, now?, dir?, editionsDir?, sentFile?, confirm:(q:string)=>Promise<string>, log?}} o
 */
export async function approveWeekly(o) {
  const { id, env, stories, config, resend, now = new Date(), dir = WEEKLY_DIR, editionsDir = EDITIONS_DIR, sentFile = SENT_FILE, log = console.log } = o;
  const ctx = context({ id, dir, stories, config, env });
  const { paths, edition, state, cfg, hash, mail } = ctx;
  if (state.status === "SENT") throw new Stop(`${id} 호는 이미 발송했습니다`);
  if (state.status === "APPROVED" && !approvalProblems(state, edition, env.NEWSLETTER_APPROVAL_SECRET).length) throw new Stop(`${id} 호는 이미 지금 원고로 승인돼 있습니다`);
  const secretProblem = approvalSecretProblem(env.NEWSLETTER_APPROVAL_SECRET);
  if (secretProblem) throw new Stop(`승인할 수 없습니다: ${secretProblem}`);
  if (typeof o.approver !== "string" || !/^[\p{L}\p{N}._ -]{2,40}$/u.test(o.approver) || o.approver.includes("@")) throw new Stop("--approver <이름>이 필요합니다 (2~40자, 이메일 주소 아님)");
  if (o.hashArg !== shortHash(hash)) throw new Stop(`--hash가 지금 원고 해시와 다릅니다 (지금 ${shortHash(hash)}). 검토한 원고가 맞는지 다시 확인하세요`);

  const qa = await finalQa({ ...ctx, stories, config, fetchImpl: o.fetchImpl, dir, editionsDir });
  if (qa.verdict === "FAIL") throw new Stop("최종 QA FAIL — 승인할 수 없습니다:\n- " + qa.items.filter((i) => i.level === "FAIL").map((i) => i.msg).join("\n- "));
  if (qa.verdict === "REVIEW" && !o.ackReview) throw new Stop("확인 필요 항목이 있습니다. 검토했다면 --ack-review를 붙이세요:\n- " + qa.items.map((i) => i.msg).join("\n- "));

  const settings = sendSettings(env, config.newsletterConfig);
  const explicit = Boolean(o.segment || o.segmentName);
  const problems = [...(explicit ? settings.problems.filter((p) => !p.startsWith("RESEND_AUDIENCE_ID")) : settings.problems), ...sendRequirements(env, config.newsletterConfig, mail)];
  if (problems.length) throw new Stop("발송 설정·필수 표기가 빠져 승인할 수 없습니다:\n- " + problems.join("\n- "));
  if (sentRecords(sentFile).some((r) => r.status === "sent" && r.date === id)) throw new Stop(`${id} 호는 발송 기록이 있습니다 (ingest/newsletter-sent.json)`);

  const found = await findBroadcasts(resend, id);
  if (found.sent.length) throw new Stop(`Resend에 이미 보낸 ${id} Broadcast가 있습니다 — 승인하지 않습니다`);
  const aud = await audienceCheck(resend, { segment: o.segment, segmentName: o.segmentName, fallbackId: explicit ? null : settings.segmentId }, cfg);
  if (aud.problems.length) throw new Stop("받는 사람 확인 실패:\n- " + aud.problems.join("\n- "));

  log(`승인 대상: ${id} · 해시 ${shortHash(hash)} · QA ${qa.verdict}${qa.verdict === "REVIEW" ? " (확인 필요 항목 검토함)" : ""}`);
  log(`받는 사람: Segment '${aud.segment.name}' · 구독 중 ${aud.subscribed.length}명 · 해지 ${aud.unsubscribed}명(제외) · 계정 연락처 ${aud.totalContacts}/${cfg.freeContactLimit}`);
  const answer = String(await o.confirm(`승인하려면 '승인 ${id}'를 입력하세요: `)).trim();
  if (answer !== `승인 ${id}`) throw new Stop("승인을 취소했습니다");

  const approvedAt = now.toISOString();
  const approval = { id, contentHash: hash, approver: o.approver.trim(), approvedAt };
  approval.signature = signApproval(env.NEWSLETTER_APPROVAL_SECRET, approval);
  approval.checks = { qa: qa.verdict, ackReview: Boolean(o.ackReview), segmentId: aud.segment.id, subscribed: aud.subscribed.length, unsubscribedExcluded: aud.unsubscribed, totalContacts: aud.totalContacts, freeContactLimit: cfg.freeContactLimit };
  const next = { ...state, status: "APPROVED", contentHash: hash, qa, approval, history: [...(state.history ?? []), { at: approvedAt, event: "approved", by: approval.approver, contentHash: shortHash(hash) }] };
  saveState(paths, next, { stories, config, env });
  log(`승인 완료 · ${id} · ${shortHash(hash)} — 발송은 별도 명령(newsletter:weekly:send --send)으로만 합니다`);
  return next;
}

// ---------- 발송 ----------

/** 발송 전 점검 (외부 호출 없음). 문제 목록을 돌려준다 */
export function offlineSendProblems({ id, edition, state, hash, mail, env, config, sentFile }) {
  const p = [];
  if (state.status !== "APPROVED") p.push(`상태가 ${state.status} — 승인(APPROVED)된 호만 발송`);
  else p.push(...approvalProblems(state, edition, env.NEWSLETTER_APPROVAL_SECRET));
  if (state.send && ["requested", "uncertain", "accepted"].includes(state.send.state)) p.push(`이전 발송 시도 상태가 '${state.send.state}' — 중복 위험. --reconcile로 Resend 기록을 먼저 확인`);
  if (sentRecords(sentFile).some((r) => r.status === "sent" && r.date === id)) p.push("발송 기록이 이미 있음 (ingest/newsletter-sent.json)");
  if (state.approval && state.approval.contentHash !== hash) p.push("승인 뒤 원고가 바뀜");
  p.push(...sendRequirements(env, config.newsletterConfig, mail));
  return [...new Set(p)];
}

/**
 * @param {{id:string, mode:"check"|"test"|"send"|"reconcile", to?:string[], again?:boolean, confirmArg?:string, hashArg?:string, expectRecipients?:number, confirmNotSent?:boolean,
 *   segment?:string, segmentName?:string, env, resend?, stories, config, fetchImpl?, now?, dir?, editionsDir?, sentFile?, logDir?, confirm?:(q:string)=>Promise<string>, sleep?:(ms:number)=>Promise<void>, log?}} o
 */
export async function sendWeekly(o) {
  const { id, mode, env, stories, config, resend, now = new Date(), dir = WEEKLY_DIR, editionsDir = EDITIONS_DIR, sentFile = SENT_FILE, logDir = LOG_DIR } = o;
  const log = (m) => (o.log ?? console.log)(redact(m, env));
  const sleep = o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const ctx = context({ id, dir, stories, config, env });
  const { paths, edition, cfg, hash, mail } = ctx;
  let state = ctx.state;
  const settings = sendSettings(env, config.newsletterConfig);
  const explicit = Boolean(o.segment || o.segmentName);
  const settingProblems = explicit ? settings.problems.filter((p) => !p.startsWith("RESEND_AUDIENCE_ID")) : settings.problems;

  if (mode === "check") {
    const problems = [...offlineSendProblems({ id, edition, state, hash, mail, env, config, sentFile }), ...settingProblems];
    log(`${id} · 상태 ${state.status} · 원고 해시 ${shortHash(hash)} · 제목 ${edition.subject}`);
    log(problems.length ? "전체 발송 불가:\n- " + problems.join("\n- ") : "점검 통과 (외부 호출 없음). 실제 발송은 --send --confirm <id> --hash <해시> --expect-recipients <N>");
    return { mode, problems };
  }
  if (!resend) throw new Stop("RESEND_API_KEY 없음 — 발송 서비스에 연결하지 않았습니다");

  // ----- 테스트 주소 (구독자 Segment에는 보내지 않음) -----
  if (mode === "test") {
    if (state.status === "HOLD") throw new Stop("HOLD 호는 테스트 발송도 하지 않습니다 (FAIL 항목부터 해결)");
    const tp = settings.problems.filter((p) => !p.startsWith("RESEND_AUDIENCE_ID"));
    if (tp.length) throw new Stop("테스트 발송 설정이 빠졌습니다:\n- " + tp.join("\n- "));
    const to = [...new Set((o.to ?? []).map((x) => String(x).trim().toLowerCase()).filter(Boolean))];
    if (!to.length || to.length > TEST_MAX) throw new Stop(`--to에 테스트 주소 1~${TEST_MAX}개가 필요합니다`);
    if (to.some((x) => !config.normalizeEmail(x))) throw new Stop("테스트 주소 형식 오류");
    const secret = env.NEWSLETTER_APPROVAL_SECRET || settings.apiKey;
    const ledgerPath = path.join(logDir, `${id}-tests.json`);
    const ledger = readJson(ledgerPath, []);
    const testMail = renderEditionEmail(edition, { mode: "test", allStories: stories, config, operatorInfo: ctx.operatorInfo });
    const results = [];
    for (const addr of to) {
      const ref = recipientRef(secret, addr);
      const prior = ledger.find((x) => x.ref === ref && x.contentHash === shortHash(hash) && x.state === "accepted");
      if (prior && !o.again) {
        results.push({ ref, state: "skipped", why: "같은 원고를 이미 이 주소로 보냄 (--again으로 다시)" });
        continue;
      }
      const key = `aimajung-weekly-test/${id}/${shortHash(hash)}/${ref}${o.again ? `/${now.getTime()}` : ""}`;
      let rec = { ref, state: "uncertain", attempts: 0 };
      for (let attempt = 1; attempt <= 3; attempt++) {
        rec.attempts = attempt;
        const out = await call(
          () => resend.emails.send({ from: settings.from, to: [addr], replyTo: settings.replyTo, subject: `[테스트] ${testMail.subject}`, html: testMail.html, text: testMail.text }, { idempotencyKey: key }),
          cfg.sendTimeoutMs,
        );
        const c = classify(out);
        if (c.kind === "accepted") {
          rec = { ...rec, state: "accepted", emailId: out.result.data?.id ?? null };
          break;
        }
        rec.why = c.why;
        // 같은 idempotency key로 다시 보내면 Resend가 한 번만 처리한다 → 요청 한도·시간 초과·5xx는 재시도해도 중복이 생기지 않는다
        if (c.kind === "rejected" && !c.retry) {
          rec.state = "failed";
          break;
        }
        rec.state = c.kind === "uncertain" ? "uncertain" : "failed";
        if (attempt < 3) await sleep(1000 * attempt);
      }
      results.push(rec);
      ledger.push({ ...rec, contentHash: shortHash(hash), at: now.toISOString(), kind: "test" });
    }
    writeJson(ledgerPath, ledger);
    for (const r of results) log(`테스트 ${r.ref.slice(0, 6)}… → ${r.state}${r.why ? ` (${r.why})` : ""}`);
    return { mode, results };
  }

  // ----- 불확실한 발송 확인 -----
  if (mode === "reconcile") {
    const found = await findBroadcasts(resend, id);
    if (found.sent.length) {
      const b = found.sent[0];
      state = markSent(state, { broadcastId: b.id, segmentId: state.send?.segmentId ?? b.segment_id ?? null, recipients: state.send?.recipientsPlanned ?? null, now, how: "reconcile" });
      appendSent(sentFile, { id, edition, state, hash });
      saveState(paths, state, { stories, config, env });
      log(`Resend 기록 확인: ${id} Broadcast ${b.id} 상태 ${b.status} → SENT로 기록 (다시 보내지 않음)`);
      return { mode, state: "accepted" };
    }
    if (!state.send || !["requested", "uncertain"].includes(state.send.state)) {
      log("확인할 불확실한 발송이 없습니다");
      return { mode, state: state.send?.state ?? null };
    }
    if (!o.confirmNotSent) {
      log(`Resend에 보낸 ${id} Broadcast가 보이지 않습니다. Resend 대시보드(Broadcasts·Emails)에서 실제로 나가지 않은 것을 확인한 뒤 --reconcile --confirm-not-sent로 '미발송'을 기록하세요`);
      return { mode, state: state.send.state };
    }
    state = { ...state, send: { ...state.send, state: "failed", resolvedAt: now.toISOString(), resolution: "편집자가 미발송 확인" }, history: [...state.history, { at: now.toISOString(), event: "send-reconciled-not-sent" }] };
    saveState(paths, state, { stories, config, env });
    log("미발송으로 기록했습니다. 다시 발송할 수 있습니다");
    return { mode, state: "failed" };
  }

  if (mode !== "send") throw new Stop(`모르는 모드: ${mode}`);

  // ----- 전체(또는 지정 Segment) 발송 -----
  // 1) 외부 호출 없는 점검
  if (o.confirmArg !== id) throw new Stop(`실제 발송하려면 --confirm ${id} 를 함께 적어야 합니다`);
  if (o.hashArg !== shortHash(hash)) throw new Stop(`--hash가 지금 원고 해시(${shortHash(hash)})와 다릅니다`);
  if (!Number.isInteger(o.expectRecipients) || o.expectRecipients < 1) throw new Stop("--expect-recipients <N> (구독 중인 받는 사람 수)이 필요합니다");
  const offline = [...offlineSendProblems({ id, edition, state, hash, mail, env, config, sentFile }), ...settingProblems];
  if (offline.length) throw new Stop("발송하지 않습니다:\n- " + offline.join("\n- "));
  // 2) 최종 QA (원고 · Production)
  const qa = await finalQa({ ...ctx, stories, config, fetchImpl: o.fetchImpl, dir, editionsDir });
  if (qa.verdict === "FAIL") throw new Stop("최종 QA FAIL — 발송하지 않습니다:\n- " + qa.items.filter((i) => i.level === "FAIL").map((i) => i.msg).join("\n- "));
  // 3) Resend: 이미 보낸 같은 호 · 받는 사람 · 무료 한도
  const found = await findBroadcasts(resend, id);
  if (found.sent.length) throw new Stop(`Resend에 이미 보낸 ${id} Broadcast가 있습니다 (${found.sent[0].id}). --reconcile로 기록만 맞추세요`);
  const aud = await audienceCheck(resend, { segment: o.segment, segmentName: o.segmentName, fallbackId: explicit ? null : settings.segmentId }, cfg);
  if (aud.problems.length) throw new Stop("받는 사람 확인 실패 — 보내지 않습니다:\n- " + aud.problems.join("\n- "));
  if (aud.subscribed.length !== o.expectRecipients) throw new Stop(`받는 사람 수가 다릅니다: 기대 ${o.expectRecipients}명, 실제 구독 중 ${aud.subscribed.length}명`);
  if (alreadySent(sentRecords(sentFile), id, aud.segment.id)) throw new Stop("이 Segment에 이미 보낸 기록이 있습니다");
  log(`발송 대상: Segment '${aud.segment.name}' · 구독 중 ${aud.subscribed.length}명 · 해지 ${aud.unsubscribed}명 제외 · 연락처 ${aud.totalContacts}/${cfg.freeContactLimit}`);

  // 4) 사람이 한 번 더 확인
  const answer = String(await (o.confirm ?? (async () => ""))(`${id} 호를 ${aud.subscribed.length}명에게 보냅니다. 계속하려면 '발송 ${id}'를 입력하세요: `)).trim();
  if (answer !== `발송 ${id}`) throw new Stop("발송을 취소했습니다");

  // 5) 보내기 전에 '요청함'을 먼저 기록 (중간에 끊겨도 다음 실행이 중복 위험을 안다)
  const ledgerPath = path.join(logDir, `${id}-recipients.json`);
  const secret = env.NEWSLETTER_APPROVAL_SECRET;
  const ledger = {
    id,
    contentHash: shortHash(hash),
    segmentId: aud.segment.id,
    recipients: aud.members.map((m) => ({ ref: recipientRef(secret, m.id ?? m.email), state: m.unsubscribed === false ? "included" : "excluded_unsubscribed" })),
  };
  writeJson(ledgerPath, ledger);
  state = { ...state, send: { state: "requested", attemptAt: now.toISOString(), segmentId: aud.segment.id, recipientsPlanned: aud.subscribed.length, broadcastId: null }, history: [...state.history, { at: now.toISOString(), event: "send-requested", recipients: aud.subscribed.length }] };
  saveState(paths, state, { stories, config, env });
  const setSend = (patch, event) => {
    state = { ...state, send: { ...state.send, ...patch }, history: [...state.history, { at: new Date().toISOString(), event, ...(patch.why ? { why: patch.why } : {}) }] };
    saveState(paths, state, { stories, config, env });
  };

  // 6) 초안 Broadcast (아무에게도 가지 않음). 같은 이름·같은 내용의 초안이 있으면 다시 쓴다
  const want = { segmentId: aud.segment.id, subject: mail.subject, from: settings.from, replyTo: settings.replyTo, html: mail.html, text: mail.text, webUrl: null, status: "draft" };
  let broadcastId = null;
  for (const d of found.drafts.filter((b) => b.name === broadcastName(id, hash))) {
    const got = await resend.broadcasts.get(d.id);
    if (!got.error && !verifyBroadcast(got.data, want).length) {
      broadcastId = d.id;
      break;
    }
  }
  if (!broadcastId) {
    const created = await call(
      () => resend.broadcasts.create({ name: broadcastName(id, hash), segmentId: aud.segment.id, from: settings.from, replyTo: settings.replyTo, subject: mail.subject, previewText: mail.preheader, html: mail.html, text: mail.text }),
      cfg.sendTimeoutMs,
    );
    const c = classify(created);
    // 초안 만들기는 메일을 보내지 않으므로 실패해도 중복 발송 위험이 없다 (남은 초안은 다음 실행에서 다시 쓴다)
    if (c.kind !== "accepted") {
      setSend({ state: "failed", why: `초안 만들기 실패: ${c.why}` }, "send-failed");
      throw new Stop(`Resend 초안 만들기 실패 (${c.why}) — 아무에게도 보내지 않았습니다`);
    }
    broadcastId = created.result.data.id;
    const stored = await resend.broadcasts.get(broadcastId);
    const bad = stored.error ? ["초안을 다시 읽지 못함"] : verifyBroadcast(stored.data, want);
    if (bad.length) {
      setSend({ state: "failed", broadcastId, why: bad.join(", ") }, "send-failed");
      throw new Stop("초안이 의도와 다릅니다 — 보내지 않습니다:\n- " + bad.join("\n- "));
    }
  }
  setSend({ broadcastId }, "draft-ready");

  // 7) 발송. 429(확실히 거절)만 다시 시도하고, 그 전에 상태를 다시 읽어 이미 나갔으면 멈춘다
  for (let attempt = 1; attempt <= 3; attempt++) {
    const out = await call(() => resend.broadcasts.send(broadcastId), cfg.sendTimeoutMs);
    const c = classify(out);
    if (c.kind === "accepted") {
      state = markSent(state, { broadcastId, segmentId: aud.segment.id, recipients: aud.subscribed.length, now: new Date(), how: "send" });
      appendSent(sentFile, { id, edition, state, hash });
      saveState(paths, state, { stories, config, env });
      writeJson(ledgerPath, { ...ledger, broadcastId, apiState: "accepted", recipients: ledger.recipients.map((r) => (r.state === "included" ? { ...r, apiState: "accepted", delivery: "unknown" } : r)) });
      log(`발송 요청 완료 · broadcast ${broadcastId} · ${aud.subscribed.length}명 (Resend가 받음. 실제 수신·반송은 Resend 대시보드에서 확인)`);
      return { mode, state: "accepted", broadcastId };
    }
    if (c.kind === "uncertain") {
      setSend({ state: "uncertain", why: c.why }, "send-uncertain");
      throw new Stop(`발송 결과가 불확실합니다 (${c.why}). 중복을 막기 위해 다시 보내지 않습니다. Resend 대시보드 확인 뒤 --reconcile`);
    }
    if (!c.retry || attempt === 3) {
      setSend({ state: "failed", why: c.why }, "send-failed");
      throw new Stop(`Resend 발송 거절 (${c.why}) — 아무에게도 보내지 않았습니다`);
    }
    await sleep(2000 * attempt);
    const now2 = await resend.broadcasts.get(broadcastId);
    if (now2.error || now2.data?.status !== "draft") {
      setSend({ state: "uncertain", why: "재시도 전 상태 확인 실패 또는 이미 발송 중" }, "send-uncertain");
      throw new Stop("재시도 전에 확인해 보니 상태가 초안이 아닙니다 — 다시 보내지 않습니다. --reconcile");
    }
  }
  throw new Stop("발송하지 못했습니다");
}

function markSent(state, { broadcastId, segmentId, recipients, now, how }) {
  return {
    ...state,
    status: "SENT",
    send: { ...(state.send ?? {}), state: "accepted", broadcastId, segmentId, recipientsPlanned: recipients, acceptedAt: now.toISOString(), delivery: "unknown (Resend 대시보드·웹훅에서 확인)" },
    history: [...(state.history ?? []), { at: now.toISOString(), event: how === "reconcile" ? "send-reconciled-sent" : "sent", broadcastId }],
  };
}
function appendSent(sentFile, { id, edition, state, hash }) {
  const records = readJson(sentFile, []);
  if (records.some((r) => r.status === "sent" && r.date === id)) return;
  records.push({ date: id, edition: id, kind: "weekly", subject: edition.subject, broadcastId: state.send.broadcastId, status: "sent", at: state.send.acceptedAt, segmentId: state.send.segmentId, recipients: state.send.recipientsPlanned, contentHash: shortHash(hash) });
  writeJson(sentFile, records);
}
