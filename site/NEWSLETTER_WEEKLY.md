# AI마중 주간 뉴스레터 (Phase 7.1.4)

매주 일요일 09:00 KST에 **원고만 자동으로 준비**하고, 편집자가 **서명으로 승인한 호만** 사람이 **별도 명령으로 발송**한다.
유료 LLM은 쓰지 않는다. 기존 뉴스레터 시스템(Resend · 메일 템플릿 · 구독 이중 확인)을 그대로 쓰고 넓혔다 — 새 발송 서비스·새 디자인 없음.

## 0. 기존 시스템 감사 (2026-10-12, 코드 수정 전)

| 항목 | 확인한 것 | 주간 뉴스레터에서 |
|---|---|---|
| 뉴스레터 생성 | `scripts/newsletter/lib.mjs` — 날짜별 자동 호(issue)와 편집 호(edition, `newsletter/editions/<id>.json`)가 같은 렌더러(`renderModel`)를 쓴다 | 편집 호 형식에 `kind: "weekly"`를 더해 같은 렌더러로 만든다 |
| HTML 템플릿 | 표 레이아웃 + 인라인 CSS, 640px, 이미지·JS 없음, 밤색 머리·흰 본문·초록 강조. 텍스트 버전 동시 생성 | 그대로. 주간 호에만 섹션 이름(이번 주 메인 등)·원문 링크 줄을 붙인다. 기존 호 렌더링은 바이트 단위로 같음(시험) |
| 구독자 저장 | Resend Contacts + Segment(General)에만. 저장소·빌드 결과에는 구독자 정보 없음 | 그대로. 주간 발송은 읽기(목록·인원)만 |
| 구독 상태 | 연락처 `unsubscribed` 값. 확인(이중 확인) 뒤에만 연락처가 생긴다 | 구독 중(`unsubscribed:false`)만 센다 |
| 발송 서비스 | **Resend** (도메인 aimajung.com 인증, `letter@aimajung.com`). 1호(2026-10-06)를 Broadcast로 지정 Segment 1명에게 보냄 | **재사용** — 다른 서비스 도입 없음 |
| 승인·발송 명령 | `newsletter:send` 점검 → `--draft` → `--send --confirm <id>` + 터미널에서 '발송' 입력. Segment·인원(`--expect-recipients`) 확인, Broadcast 재확인(`verifyBroadcast`) | 같은 함수(`resolveSegment`·`listSegmentMembers`·`verifyBroadcast`·`sendSettings`)를 쓰고, 그 위에 서명 승인·해시·중복·무료 한도를 더함. 기존 명령은 주간 호를 거부한다 |
| 발송 이력·중복 방지 | `ingest/newsletter-sent.json` (날짜·제목·broadcast id·Segment·인원, 이메일 없음). 같은 호+같은 Segment 재발송 차단 | 같은 파일에 `kind: "weekly"` 기록을 더한다. 1호 기록은 그대로 |
| 구독 해지 | Broadcast의 `{{{RESEND_UNSUBSCRIBE_URL}}}` → Resend가 구독자별 해지 처리. 미리보기·테스트는 `/newsletter/unsubscribe/` 안내 페이지 | 그대로. 원고·발송 전에 해지 링크 자리를 검사 |
| GitHub Actions | `daily-editorial.yml`(DAILY)만 있음. 뉴스레터 workflow 없음 | 새 workflow 2개. DAILY는 변경 없음 |
| 기사 데이터 | `content/stories/*.json` 722건, 모두 `status: published`. `publishedAt`(AI마중 발행일) · `eventDate`(원 발표일) · `priority` 1~3 · `editorialDepth` | 대상 주간은 `publishedAt`, 최신성은 `eventDate`로 본다 |
| 운영 설정 | `newsletterReplyTo`·`newsletterOperatorInfo`는 설정 파일에 비어 있음(운영자가 정할 값). 로컬 `.env.local`에는 Reply-To가 있고 발행인 정보는 없음 | **발행인 정보가 없으면 전체 발송을 막는다** (아래 §6) |
| 최소 기사 수 정책 | 운영 문서에 없음 | 설정값 `NEWSLETTER_WEEKLY_MIN_STORIES`(기본 3 = 1호 구성: 메인 1 + 기사 2) |

확인한 외부 사실 (2026-10-12, Resend 공식 문서):
- 무료 플랜: 트랜잭션 메일 월 3,000통·하루 100통, **마케팅(Broadcast) 연락처 1,000명까지, 발송 수는 연락처 수로만 제한**. 한도를 넘으면 알림과 업그레이드 선택지가 오고 자동 전환은 없다 ([pricing](https://resend.com/pricing)).
- Idempotency key: **Send Email · Send Batch만** 지원(24시간), Broadcast는 지원하지 않음 ([idempotency keys](https://resend.com/docs/dashboard/emails/idempotency-keys)). 설치된 SDK(resend 6.x) 타입도 같다.
- 구독 해지한 연락처는 Broadcast에서 자동으로 빠진다 ([Segments](https://resend.com/docs/dashboard/segments/introduction)).
- Broadcast 상태: `draft` · `queued` · `sent`. 수신자별 전달 결과(전달·반송)는 API로 조회하지 않고 대시보드·웹훅에서 본다.

## 1. 흐름

```
[예약] 일요일 09:00 KST  newsletter-weekly.yml   (Secret 없음, 메일 없음)
  발행 기사 → 대상 주간 선정 → 원고 → QA → newsletter/weekly/<id>/ → 브랜치 newsletter/weekly-<id> + PR
[사람] PR에서 검토 → (필요하면 edition.json 수정 → npm run newsletter:weekly로 QA 다시)
[사람] 테스트 발송  npm run newsletter:weekly:send -- --edition <id> --test --to <내 주소>
[사람] 승인        npm run newsletter:weekly:approve -- --edition <id> --hash <12자> --approver <이름>   ← 비밀값 서명
[사람] PR merge     (merge는 승인도 발송도 아니다)
[사람] 발송        npm run newsletter:weekly:send -- --edition <id> --send --confirm <id> --hash <12자> --expect-recipients <N>
                   또는 Actions → 'AI마중 뉴스레터 발송 (수동)' (보호된 Environment)
```

상태: `DRAFT`(확인 필요 항목 있음) · `HOLD`(발송 불가) · `READY`(자동 검증 통과 — **승인 아님**) · `APPROVED`(서명 승인) · `SENT`.

## 2. 주차 (edition ID)

- edition ID = **한국 시간 일요일 날짜** (예: `2026-10-11`). 대상 기간 = ID-7일 ~ ID-1일 (일~토, `publishedAt` 기준).
- 예약 실행은 지금의 한국 날짜가 속한 주의 일요일을 고른다(`editionIdFor(kstDate())`). GitHub 예약 실행이 몇 시간 늦어도, 월요일 새벽으로 밀려도 같은 호를 가리킨다.
- 다시 돌리면: 같은 브랜치·같은 PR을 갱신한다. 내용이 같으면 파일을 바꾸지 않는다(커밋·PR 변화 없음). 편집자가 고친 원고는 다시 만들지 않고 QA만 다시 한다. APPROVED(원고 그대로)·SENT는 건드리지 않는다.

## 3. 기사 선정 (`weekly.mjs` `selectWeekly`)

제외 (보고서에 이유와 함께 표시):
- AI마중 발행일이 대상 주간 밖 · `status`가 published가 아님 · **Production 사이트맵(https://aimajung.com/sitemap.xml)에 없음** · 기사 QA FAIL(`scripts/qa/quality-rules.mjs`, `qa:quality`와 같은 규칙) · 이미 보낸 호(편집 호·승인/발송된 주간 호)에 실린 기사 · 원 발표일이 대상 기간 시작보다 14일 넘게 이전 · 원문 주소 없음 · 같은 사안(제목이 거의 같거나 같은 회사·같은 제품·3일 이내)
- Shadow 후보·AI 초안·HOLD/EXCLUDE 후보는 `ingest/daily/`에만 있고 `content/stories`에 없으므로 처음부터 대상이 아니다.
- 사이트맵을 읽지 못하면 성공한 척하지 않고 호 전체를 HOLD한다.

순위: 중요도(priority) > 깊이(심층·일반) > 기사 QA PASS > 이번 주 발표 → 발표일 최신 → slug.
- 메인 1 + 함께 볼 변화 최대 4: **중요도 2 이하만**, 같은 회사 최대 2건. 나머지(중요도 3 등)는 '추가로 읽을 기사' 최대 4건(제목·링크만).
- 억지로 채우지 않는다: 메인 + 함께 볼 변화가 최소 기사 수보다 적으면 HOLD.
- 설정(Variables): `NEWSLETTER_WEEKLY_MIN_STORIES`(3) · `_MORE_MAX`(4) · `_READ_MORE_MAX`(4) · `_IMPORTANT_PRIORITY`(2) · `_MAX_PER_COMPANY`(2) · `_MAX_EVENT_AGE_DAYS`(14).

## 4. 원고 (AI 없이)

| 메일 부분 | 출처 |
|---|---|
| 이메일 제목 | `🤖 {메인 기사 제목} 외 N건 — AI마중 주간` |
| 프리헤더 | 메인 기사 요약 첫 문장 + "외 N건을 함께 정리했습니다." |
| 인트로 | 고정 문장: 기간 · 이번 주 기사 수 · 고른 수 (숫자는 실제 건수와 대조) |
| 이번 주 메인 | 기사 제목 · 요약(심층이면 lead) · 핵심 사실 3개 · whyItMatters('이 뉴스의 POINT') · 기사 링크 · **원문 링크** |
| 이번 주 함께 볼 변화 | 기사 제목 · 요약 · whyItMatters('왜 봐야 하나') · 기사 링크 · 원문 링크 |
| 추가로 읽을 기사 | 기사 제목 · 링크 · 발표일 |
| 꼬리 | 웹사이트 · 지난 뉴스레터 · **구독 해지** · 구독 안내 · **발행인 정보** · 발행일(머리의 dateLine) |

웹 버전 페이지가 없으므로 주간 호에는 '웹에서 보기'를 넣지 않는다 (웹 게시는 이번 범위 밖 — Production 변경 없음).

## 5. 자동 QA (`qaWeekly`) — FAIL → HOLD, REVIEW → DRAFT, 통과 → READY

- FAIL: 0건 · 최소 기사 수 미달 · 없는 기사 · 미발행 · Production 미확인 · 기사 QA FAIL · 이미 보낸 기사 · 대상 주간 밖 · 오래된 소식 · 원문 주소 없음/불일치 · **기사에 없는 숫자**(제목·본문·사실·POINT·프리헤더·인트로) · 구독 해지 자리 없음 · 빈 값 · 기사 링크 누락 · 이메일 주소·키 같은 문자열 · 광고 포함 호
- REVIEW: 기사 QA REVIEW 기사 포함 · 기사 문장과 달라진 문장(편집자 수정) · 제목·인트로가 기본 형식과 다름 · 제목 80자 초과
- READY는 자동 검증 통과일 뿐 승인이 아니다.

## 6. 승인 (`newsletter:weekly:approve`)

- 승인은 **NEWSLETTER_APPROVAL_SECRET**(32자 이상, 승인자만 가진 비밀값)으로 만든 HMAC 서명이다: `HMAC(id · 원고 해시 · 승인자 · 시각)`.
  PR merge, PR 댓글, state.json을 손으로 APPROVED로 바꾸기, 임의 문자열로는 승인되지 않는다 (서명이 맞지 않으면 발송이 멈춤 — 시험 있음).
- 승인 때 확인: edition ID · `--hash`가 지금 원고 해시와 같음 · 최종 QA(사이트맵 다시 확인, FAIL이면 거부, REVIEW면 `--ack-review` 필요) · 발송 설정(API 키·Segment·발신 주소·Reply-To) · **발행인 정보·구독 해지 링크** · 구독자 상태(Resend 읽기: 구독 중·해지·중복 주소·무료 한도) · 이미 보낸 호가 아닌지(기록 파일 + Resend Broadcast 이름) · 터미널에서 `승인 <id>` 입력.
- 승인 뒤 원고가 한 글자라도 바뀌면 승인이 무효다: 발송이 멈추고, 준비를 다시 돌리면 승인을 지우고 이력에 `approval-invalidated`를 남긴다.

## 7. 발송 (`newsletter:weekly:send`)

| 모드 | 하는 일 |
|---|---|
| (기본) 점검 | 외부 호출 없이 발송 가능 여부만 |
| `--test --to a,b` | 테스트 주소(최대 5)에만 `[테스트]` 제목으로 주소마다 따로. **idempotency key** `aimajung-weekly-test/<id>/<해시>/<주소 해시>` — 시간 초과·429·5xx는 같은 키로 최대 3번 재시도(중복 없음). 주소별 결과(accepted·failed·uncertain)를 `ingest/log/newsletter-weekly/`(git 제외)에 남긴다 |
| `--send --confirm <id> --hash <12자> --expect-recipients <N>` | 전체(또는 `--segment-name`) 발송. 아래 순서 |
| `--reconcile [--confirm-not-sent]` | 결과가 불확실했던 발송을 Resend 기록으로 확인 |

실제 발송 순서 (하나라도 걸리면 멈추고 아무에게도 보내지 않음):
1. 외부 호출 없이: `--confirm` = ID · `--hash` = 원고 해시 · 상태 APPROVED · **서명 유효** · 승인 해시 = 지금 원고 · 이전 발송 시도가 requested/uncertain/accepted가 아님 · 발송 기록 없음 · 발행인 정보·Reply-To·해지 링크
2. 최종 QA (사이트맵 다시 확인)
3. Resend 읽기: 같은 호 Broadcast(이름 `AI마중 주간 <id> (<해시>)`)가 이미 나갔는지 · Segment 실제 연락처 목록 → 구독 중 인원 = `--expect-recipients` · 해지자 제외 · 같은 주소 중복이면 중단 · 계정 연락처가 **무료 한도(1,000)** 를 넘으면 중단
4. 터미널에서 `발송 <id>` 입력
5. **보내기 전에** state에 `requested`를 기록 (중간에 끊겨도 다음 실행이 안다)
6. 초안 Broadcast 생성(아무에게도 안 감) → 다시 읽어 내용 확인 (같은 이름·같은 내용 초안이 있으면 재사용)
7. 발송 1회. 결과 분류:
   - 수락 → `SENT`, `newsletter-sent.json` 기록. **API 수락 ≠ 실제 수신** — `delivery: unknown`, 전달·반송은 Resend 대시보드에서.
   - 429 → 확실히 거절된 것이므로 재시도. 단 재시도 전에 Broadcast 상태를 다시 읽어 초안이 아니면(이미 나가는 중) 멈춤.
   - 4xx → `failed` (보내지지 않음, 고친 뒤 다시 가능)
   - 시간 초과·접속 오류·5xx → `uncertain`. **다시 보내지 않는다.** `--reconcile`: Resend에 나간 Broadcast가 보이면 SENT로 기록, 안 보이면 대시보드 확인 후 `--confirm-not-sent`로만 재발송을 허용.

수신자별 기록: 전체 발송은 Broadcast 한 번이라 수신자별 API 결과가 따로 없다. 발송 직전 연락처 목록을 `included` / `excluded_unsubscribed`로 나눠 `ingest/log/newsletter-weekly/<id>-recipients.json`(git 제외)에 남긴다 — 이메일·연락처 id 대신 비밀값으로 만든 해시만. **저장소가 공개라 수신자 정보는 해시도 커밋하지 않는다.** 커밋되는 기록은 인원 수뿐이다.

## 8. 수신 동의 · 구독 해지 · 법적 표기

| 항목 | 현재 상태 |
|---|---|
| 명시적 수신 동의 | 구독 폼의 동의 체크(`consent: true` 아니면 400) + 이중 확인(메일 버튼을 눌러야 연락처 생성). 동의 시각은 Resend 연락처 생성 시각으로만 남는다 (별도 동의 기록 없음) |
| 구독 상태 | Resend 연락처 `unsubscribed`. 주간 발송은 구독 중만 센다 |
| 수신 거부 | 모든 실제 발송에 Resend 구독자별 해지 링크 + Resend가 넣는 List-Unsubscribe 헤더. 해지자는 Broadcast에서 자동 제외 |
| 중복 이메일 | 연락처는 주소당 하나(Resend). 그래도 대소문자·공백 차이로 겹치면 발송 중단 |
| 반송·스팸 신고 | **처리 코드 없음 (웹훅 미구성)**. Resend의 자동 처리 여부는 이번에 공식 문서로 확인하지 못했다 → 대시보드에서 확인 필요 |
| 개인정보 보관 | 이메일·관심 분야를 Resend에만, 해지할 때까지 (`newsletterPrivacy`). 저장소·로그에는 없음 |

정보통신망법 제50조(영리목적 광고성 정보 전송)는 사전 동의, 전송자 명칭·연락처 표시, 수신 거부 방법 표시, 광고성 정보의 '(광고)' 표시 등을 요구한다. AI마중 주간 뉴스레터가 '광고성 정보'인지는 법률 판단이 필요하다 — 여기서는 판단하지 않고 보수적으로:
- **발행인 정보(전송자 명칭·연락처)가 없으면 전체 발송을 막는다** (`NEWSLETTER_OPERATOR_INFO`, 메일 하단에 표시). 현재 비어 있음 → 지금은 전체 발송 불가.
- 수신 거부 링크가 없으면 막는다. Reply-To(답장·거부 요청 받는 곳)가 없으면 막는다.
- 광고가 들어간 호(`containsAdvertising: true`)는 이 시스템으로 보내지 않는다 ('(광고)' 표시·2년마다 수신 동의 확인 등 별도 요건).
- 실제 전체 발송 전에 운영자가 표기 문구를 확정하고, 필요하면 KISA 「불법스팸 방지를 위한 정보통신망법 안내서」나 전문가로 확인한다.

## 9. GitHub Actions

| workflow | 실행 | 권한 · Secret |
|---|---|---|
| `newsletter-weekly.yml` (AI마중 주간 뉴스레터 준비) | 예약 `0 0 * * 0`(UTC) = 일요일 09:00 KST · 수동 재실행(edition 입력) · Variable `NEWSLETTER_WEEKLY_ENABLED=true`일 때만 | `contents: write`(newsletter/weekly-* 브랜치만) · `pull-requests: write`. **Secret 참조 없음** |
| `newsletter-send.yml` (AI마중 뉴스레터 발송 (수동)) | 수동만, master에서만 · action: check / test / send / reconcile | `environment: newsletter-send` — 발송 Secret은 이 Environment에만. 기록은 실행마다 새 브랜치 + PR |

- Environment secrets는 그 Environment를 쓰는 job에만 주어진다 → 예약 준비 workflow는 발송 Secret에 접근할 수 없다. **저장소(Repository) Secret에 RESEND_API_KEY를 두지 않는다.**
- `newsletter-send` Environment에 Required reviewers(본인)와 Deployment branches = master를 걸면, 발송 실행마다 GitHub에서 한 번 더 승인해야 시작된다.
- DAILY workflow(`daily-editorial.yml`)는 바꾸지 않았다.

## 10. 켜는 방법

**정기 준비** (외부 가입 없음, 비용 없음)
1. Settings → Secrets and variables → Actions → Variables → `NEWSLETTER_WEEKLY_ENABLED` = `true`
2. (선택) 같은 곳에 `NEWSLETTER_OPERATOR_INFO`(발행인 정보), `NEWSLETTER_REPLY_TO`, 선정 기준 변수
3. Actions → 'AI마중 주간 뉴스레터 준비' → Run workflow로 한 번 확인 (edition 비우면 이번 주)

**실제 발송** (사용자 승인 뒤에만)
1. 발행인 정보 확정 → `NEWSLETTER_OPERATOR_INFO` (예: 상호 또는 이름 · 연락처 · 주소. 임의로 채우지 않는다)
2. 승인 비밀값 만들기: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` → `.env.local`의 `NEWSLETTER_APPROVAL_SECRET` (채팅·git에 붙이지 않음)
3. 로컬 `.env.local`: `RESEND_API_KEY` · `RESEND_AUDIENCE_ID`(General Segment) · `NEWSLETTER_REPLY_TO` · `NEWSLETTER_OPERATOR_INFO` · `NEWSLETTER_APPROVAL_SECRET`
4. (Actions로 보낼 때만) Settings → Environments → `newsletter-send` 만들기 → Required reviewers · Deployment branches(master) → Environment secrets: `RESEND_API_KEY` · `NEWSLETTER_APPROVAL_SECRET` · `RESEND_AUDIENCE_ID` · `NEWSLETTER_TEST_TO`, Variables: `NEWSLETTER_REPLY_TO` · `NEWSLETTER_OPERATOR_INFO`
5. 매주: PR 검토 → 테스트 발송 → 승인(해시·인원 확인) → PR merge → 발송 명령(`--expect-recipients`에 승인 때 본 인원)

## 11. 점검

- `npm run qa:weekly` — mock Resend·mock 사이트맵으로 29개 시나리오 (0건 · 기사 부족 · 정상 · 재실행 · PR 중복 · 미발행/Production 미확인 · QA FAIL · 숫자 생성 · 승인 없는 발송 · 서명 위조 · 승인 후 수정 · 1회 발송 · 확인 입력 · 중복 주소 · 해지자 · 무료 한도 · 테스트 주소 부분 실패 · 시간 초과 · 429/5xx 재시도 · 로그 보호 · 예약 실행 발송 0회 등). 실제 메일·외부 접속 없음.
- 로컬 원고 확인: `npm run newsletter:weekly -- --edition 2026-10-11` (사이트맵 GET만) — 결과는 `newsletter/weekly/<id>/`. 커밋하지 않으려면 확인 뒤 지운다(정기 준비는 workflow 브랜치에서).
