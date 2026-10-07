# AI마중 뉴스레터 운영 문서

구독 신청 → 확인 메일(이중 확인) → 확인 시 Resend 연락처 저장 → 호 만들기 → 미리보기 → 테스트 발송 → 실제 발송까지의 흐름과 규칙.
자동 발송(cron)은 없다. 모든 발송은 사람이 명령을 실행해야 일어난다.

## 1. 구조

```
기사(content/stories) ──▶ 날짜별 호(issue) ──▶ 웹 (/newsletters/<date>/)
                                         └──▶ 메일 HTML·텍스트 (scripts/newsletter/lib.mjs)
구독 페이지 /newsletter/subscribe/ ──POST──▶ /api/newsletter/subscribe/ ──▶ 확인 메일 (Resend Emails, 연락처는 아직 안 만듦)
메일의 버튼 → /newsletter/confirm/#token=… ──POST──▶ /api/newsletter/confirm/ ──▶ Resend Contacts + General Segment + interests
```

- 공식 주소는 `https://aimajung.com` (`src/config/site.ts`의 `url`). 메일의 웹에서 보기·지난 뉴스레터·기사·수신거부 안내 링크가 모두 이 주소로 만들어진다.
  구독 페이지: https://aimajung.com/newsletter/subscribe/ · 구독 확인: https://aimajung.com/newsletter/confirm/ · 수신거부 안내: https://aimajung.com/newsletter/unsubscribe/
- 사이트 본문은 지금처럼 정적 export(`out/`)다. 서버에서 도는 것은 `api/newsletter/subscribe.ts`, `api/newsletter/confirm.ts` 두 개뿐이다.
  Vercel이 `site/api/` 폴더를 Function으로 배포한다 (Next.js의 `output: "export"`는 그대로).
- 메일은 웹 뉴스레터와 같은 데이터·같은 순서(사건 날짜 → priority → slug)로 만든다. 메일 전용 원고는 없다.
- 구독자 이메일은 Resend에만 저장한다. 사이트 저장소·정적 JSON·빌드 결과에는 구독자 정보가 없다.

| 파일 | 역할 |
|---|---|
| `src/config/newsletter.ts` | 발신자(letter@aimajung.com)·Reply-To·Segment·확인 링크 유효 시간, 관심 분야, 개인정보 안내, 결과 문구 |
| `src/lib/newsletterSubscribe.ts` | 신청·확인 처리 규칙 (검증·허니팟·요청 제한·재신청·재구독), Resend 연결 |
| `src/lib/newsletterToken.ts` | 확인 토큰 (AES-256-GCM 암호화 + 위변조 방지 + 만료) |
| `src/lib/newsletterConfirmEmail.ts` | 구독 확인 메일 HTML·텍스트 |
| `api/newsletter/subscribe.ts`, `api/newsletter/confirm.ts` | Vercel Function 입구 (POST만) |
| `src/components/newsletter/SubscribeForm.tsx`, `ConfirmClient.tsx` | 구독 폼, 확인 페이지 동작 |
| `src/app/newsletter/subscribe/`, `confirm/`, `unsubscribe/` | 구독 · 구독 확인 · 수신거부 안내 페이지 |
| `scripts/newsletter/lib.mjs` | 호 → 메일 HTML·텍스트, 발송 설정 검사 |
| `scripts/newsletter/*.mjs` | preview · test-send · send · setup · check |
| `ingest/newsletter-sent.json` | 초안·발송 기록 (날짜·제목·broadcast id만. 구독자 정보 없음) |

## 2. 처음 한 번 준비 (운영자)

1. **Resend 계정** — resend.com 가입. (Vercel Marketplace의 Resend 통합으로 만들어도 된다: `vercel integration add resend`.)
2. **발신 도메인 인증** — Resend → Domains에서 `aimajung.com`을 `verified`로 만든다 (완료).
   발신 주소는 `AI마중 <letter@aimajung.com>` (설정 파일 기본값, `NEWSLETTER_FROM_EMAIL`로 바꿀 수 있다). `*.vercel.app`은 쓸 수 없다.
3. **Segment** — Resend가 만든 `General` Segment를 쓴다. 그 ID를 `RESEND_AUDIENCE_ID`에 넣는다
   (변수 이름은 운영 중이라 그대로 두지만 값은 Segment ID다. Resend가 예전 'Audience'를 'Segment'로 바꿨다).
4. **API 키** — 구독 Function은 연락처(Contacts)와 메일 발송(Emails) 권한이 모두 필요하다 (확인 메일을 보내므로). 발송 스크립트는 Full access.
5. **확인 토큰 비밀값** — `NEWSLETTER_CONFIRM_SECRET`: 32자 이상 무작위 문자열. 예) `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`
   코드·git·채팅에 붙여 넣지 않는다. 바꾸면 아직 확인하지 않은 링크가 모두 무효가 된다 (이미 확정된 구독자에는 영향 없음).
6. **환경변수** — 이름은 `.env.example` 참고.
   - 로컬: `.env.example`을 `.env.local`로 복사해 채운다 (`.env.local`은 git에 올라가지 않는다).
   - Vercel: Project Settings → Environment Variables에 `RESEND_API_KEY`, `RESEND_AUDIENCE_ID`, `NEWSLETTER_CONFIRM_SECRET`을 Production에 넣고 다시 배포한다.
     셋 중 하나라도 없으면 구독 신청·확인 API는 503(`unavailable`)을 돌려준다.
7. **점검·속성 만들기** — `npm run newsletter:setup -- --apply`
   API 키, Segment, 발신 도메인 인증, 관심 분야 속성(`interests`)을 확인하고, 속성이 없으면 만든다.
   **`interests` 속성이 없으면 구독 신청이 실패한다.**
8. **Reply-To** — 실제로 받아 볼 수 있는 받은편지함(예정: `hello@aimajung.com`)을 만든 뒤에만 `NEWSLETTER_REPLY_TO`(또는 `newsletterReplyTo`)에 넣는다.
   비어 있으면 확인 메일은 Reply-To 없이 나가고, 정기 뉴스레터 발송(`newsletter:send`)은 멈춘다. 없는 받은편지함을 문의 창구처럼 안내하지 않는다.
9. **발행인 정보** — 메일 하단에 적을 정보(상호·연락처 등)를 `NEWSLETTER_OPERATOR_INFO` 또는 `src/config/newsletter.ts`에 넣는다. 임의로 채우지 않는다.

설정이 빠져 있으면 구독 API는 성공인 척하지 않고 503(`unavailable`)을 돌려주며, 화면에는 일반 오류 문구가 나온다.

## 3. 구독 처리 규칙 (이중 확인)

### 3-1. 신청 `POST /api/newsletter/subscribe/`

신청 단계에서는 Resend 연락처를 만들지도, 조회하지도 않는다. 확인 메일만 보낸다 (`POST /emails`, 이메일은 요청 본문에만).
그래서 확인하지 않은 주소는 Segment에 없고 정기 뉴스레터(Broadcast) 대상이 아니다.

| 상황 | 응답 | 화면 문구 |
|---|---|---|
| 정상 · 같은 주소 재신청 · 이미 구독 중인 주소 | 200 `confirmation_sent` (모두 같음) | 확인 메일을 보냈습니다. 메일에서 구독 확인 버튼을 눌러 주시면 구독이 완료됩니다… |
| 같은 주소로 1시간에 3번 넘게 신청 | 200 `confirmation_sent` (메일은 더 보내지 않음) | 위와 같음 |
| 허니팟(숨은 칸) 채워짐 | 200 `confirmation_sent` (아무것도 안 함) | 위와 같음 |
| 이메일 형식 오류 / 동의 없음 | 400 `invalid_email` / `consent_required` | 각 안내 문구 |
| 요청 과다 (IP당 10분 5회) | 429 `rate_limited` | 요청이 너무 많습니다… |
| 다른 사이트에서 온 요청 (Origin 불일치) | 403 `forbidden` | 일반 오류 |
| 메일 발송 실패 · 설정 없음 | 502 `error` · 503 `unavailable` | 지금은 구독 신청을 처리하지 못했습니다… |

- 이미 구독 중인지 화면이 알려주지 않는다 (가입 여부 노출 방지). 이미 구독 중인 사람이 다시 신청하면 확인 메일이 가고, 확인하면 관심 분야가 새로 저장된다.

### 3-2. 확인 토큰

- 확인 링크: `https://aimajung.com/newsletter/confirm/#token=…` — 토큰은 `#` 뒤에 있어 서버 접속 기록·Referer에 남지 않는다. 페이지가 토큰을 본문에 담아 확인 API로 보낸다.
- 토큰 = AES-256-GCM(`{이메일, 관심 분야, 만료 시각}`), 키는 `NEWSLETTER_CONFIRM_SECRET`에서 HKDF로 만든다.
  암호화라 링크에서 이메일을 읽을 수 없고, 인증태그 때문에 비밀값 없이 위조·수정할 수 없다.
- 유효 시간 **24시간** (`newsletterConfig.confirmTokenTtlHours`). 만료 판정은 위변조 검사를 통과한 토큰에만 한다.
- DB가 없어 '한 번만 사용'은 강제하지 않는다. 대신 같은 토큰을 여러 번 써도 결과가 같다 (중복 연락처·중복 Segment 없음).
  링크를 여는 것만으로(GET) 처리되지 않고 페이지의 POST로 처리되므로, 자바스크립트를 실행하지 않는 메일 보안 검사기의 미리 열기로는 확정되지 않는다.
- 남는 위험: 24시간 안에 링크가 남에게 전달되면 그 사람이 열어도 확정된다. 확인 메일을 받은 사람만 링크를 가지므로 받아들일 수 있는 수준으로 본다.

### 3-3. 확인 `POST /api/newsletter/confirm/`

| 상황 | 응답 | 화면 문구 |
|---|---|---|
| 정상 (새 주소 · 해지했던 주소) | 200 `confirmed` | AI마중 뉴스레터 구독이 완료되었습니다… |
| 이미 구독 중이던 주소 · 같은 링크 다시 열기 | 200 `already_confirmed` | 이미 구독이 확인된 이메일입니다… |
| 만료된 링크 | 410 `expired` | 확인 링크가 만료되었습니다. 구독 페이지에서 다시 신청해 주세요. |
| 위변조·잘린 링크·토큰 없음 | 400 `invalid` | 확인 링크가 올바르지 않습니다… |
| 요청 과다 (IP당 10분 30회) / 다른 사이트 | 429 / 403 | |
| Resend 실패 · 설정 없음 | 502 `error` · 503 `unavailable` | 지금은 구독을 확인하지 못했습니다… (새로고침으로 재시도) |

Resend 처리 (이메일은 URL에 넣지 않는다 — 생성은 본문, 나머지는 연락처 id):
1. `POST /contacts {email, unsubscribed:false, properties:{interests}, segments:[{id: General}]}`
2. id를 받으면 `GET /contacts/{id}` — 5분 안에 만들어진 새 연락처면 끝 (호출 2번).
3. 생성이 실패하면(이미 있는 주소) `GET /contacts?limit=100&after=…`로 목록을 넘겨 id를 찾는다. 못 찾으면 원래 오류로 실패.
4. 원래 있던 연락처: `PATCH /contacts/{id} {unsubscribed:false, interests}`, General에 없으면 `POST /contacts/{id}/segments/{segmentId}`.
5. Resend 요청 한도(rate_limit_exceeded)는 잠깐 쉬고 최대 3번 다시 시도한다.

- 이미 있는 주소로 `POST /contacts`를 보냈을 때 Resend가 오류를 주는지, 기존 id를 돌려주는지는 SDK 문서로 확인되지 않아 두 경우를 모두 처리한다 (`qa:newsletter`가 둘 다 시험).
- 목록 넘기기는 연락처 1만 명까지 (`SCAN_MAX_PAGES`). 그보다 커지면 Resend 연락처 id를 따로 보관하는 저장소를 검토한다.
- 저장 항목: 이메일, 관심 분야(연락처 속성 `interests`, 쉼표로 이은 key). 이름 등은 받지 않는다.
- 응답에는 code만 담는다. Resend 이름·오류 원문·키는 응답에 나가지 않는다.
- 로그에는 이메일 대신 해시 앞 10자리만 남는다 (`{"evt":"newsletter","step":"confirm","result":"subscribed","email":"3f2a…"}`).
  Resend SDK는 `NODE_ENV`가 production이 아니면 오류와 요청 경로를 콘솔에 찍는다. Vercel Function은 production이고, 요청 경로에도 이메일이 없다.
- 요청 제한은 Function 인스턴스 메모리 기준이다 (인스턴스가 여러 개면 각자 센다). 스팸이 늘면 Vercel BotID·WAF 규칙이나 CAPTCHA를 더한다.

### 3-4. 구독 확인 메일

- 보낸 사람 `AI마중 <letter@aimajung.com>`, 제목 `AI마중 뉴스레터 구독을 확인해 주세요`, Reply-To는 설정돼 있을 때만.
- 내용: 신청 안내 → [뉴스레터 구독 확인] 버튼 → 본인이 신청하지 않았다면 무시 → 24시간 뒤 만료 → AI마중 · aimajung.com. HTML·텍스트 두 가지.
- 미리보기: `npm run newsletter:preview` → `ingest/log/newsletter-preview/confirm-email.html`

## 4. 메일 구성

| 순서 | 섹션 | 내용 | 표시 조건 |
|---|---|---|---|
| 머리 | AI마중 · 날짜 · 메시지 · 웹에서 보기 · 지난 호 | | 항상 |
| 1 | ☀️ 오늘의 AI | 상위 5건 제목 | 2건 이상일 때 |
| 2 | 🔥 오늘의 메인 | priority 1순위 기사: 분류, 제목, 요약(심층이면 lead), 사실 3개, 기사 링크 | 항상 |
| 3 | ⚡ 놓치면 아쉬운 변화 | 나머지 기사 제목+요약 최대 8건, 넘치면 "더 보기" | 2건 이상일 때 |
| 4 | 🧪 AI마중이 확인한 것 | 직접 확인한 콘텐츠(contentType이 NEWS가 아닌 것) | 그런 콘텐츠가 있을 때만 (지금은 없음 → 숨김) |
| 5 | 📌 AI마중 POINT | 메인이 심층이면 point 섹션 첫 문단, 아니면 whyItMatters | 항상 |
| 6 | 📚 더 읽어보기 | 메인과 주제가 겹치는 지난 기사 3건 | 있을 때만 |
| 꼬리 | 웹사이트 · 지난 뉴스레터 · 수신거부, 발행인 정보 | | 항상 |

- 제목 기본값: `🤖 {메인 기사 제목} — AI마중`. 프리헤더 기본값: 메인 요약 첫 문장 + "외 N건". `--subject`, `--preheader`로 바꿀 수 있다. 낚시성 제목은 쓰지 않는다.
- HTML: 표 레이아웃 + 인라인 CSS, 폭 640px(모바일 100%), JavaScript 없음, 이미지 없음. 텍스트 버전도 함께 보낸다.
- 수신거부: 실제 발송에서는 Resend가 `{{{RESEND_UNSUBSCRIBE_URL}}}`을 구독자별 링크로 바꾼다. 미리보기·테스트 메일에는 `/newsletter/unsubscribe/` 안내 페이지가 들어간다.

## 5. 발송 절차 (매 호)

1. 기사 발행(`DAILY_PUBLISHING.md`)을 마치고 배포까지 끝낸다. 메일 링크가 웹 기사로 가므로 웹이 먼저다.
2. **미리보기** — `npm run newsletter:preview -- --date 2026-10-05`
   → `ingest/log/newsletter-preview/index.html`에서 375 / 600 / 680px 폭으로 확인. 외부 호출 없음.
3. **테스트 발송** — `npm run newsletter:test -- --date 2026-10-05 --to 내주소`
   한 주소에만 `[테스트]` 제목으로 간다. Gmail·네이버 메일·모바일에서 열어 본다.
4. **점검** — `npm run newsletter:send -- --date 2026-10-05` (외부 호출 없음. 빠진 설정·중복 발송을 잡는다)
5. **초안** — `npm run newsletter:send -- --date 2026-10-05 --draft` → Resend에 초안 Broadcast (아무에게도 안 감)
6. **발송** — `npm run newsletter:send -- --date 2026-10-05 --send --confirm 2026-10-05`
   터미널에서 `발송`을 한 번 더 입력해야 보낸다. 기록은 `ingest/newsletter-sent.json`에 남고 같은 호는 다시 보내지 않는다. 기록 파일은 커밋한다.

발송 스크립트는 다음 경우 멈춘다: `--date` 없음, 없는 호, 이미 보낸 호, API 키·Segment·발신 주소 없음, 발신 주소가 vercel.app, 수신거부 링크 누락, `--confirm` 불일치.

## 6. 점검

- `npm run qa:newsletter` — 외부 호출 없이 이중 확인 흐름(신청 시 연락처 미생성·토큰 위변조/만료/재사용·재신청·해지 후 재구독·허니팟·API 실패·설정 없음·요청 제한·Origin, 실제 SDK 요청 URL에 이메일 없음)과 메일 렌더링(모든 호, 섹션 표시 조건, 수신거부, 이스케이프), 저장소·빌드 결과의 비밀값 여부를 시험한다.
- `npm run newsletter:preview -- --cases` — 최신 호, 긴 제목, 단신이 많은 날, 심층 메인, 8건 초과, 1건뿐인 날, 관련 기사 없는 날을 한 번에 만든다.

## 7. 보안 원칙

- `RESEND_API_KEY`는 `.env.local`과 Vercel Environment Variables에만 둔다. 코드·git·클라이언트 번들에 넣지 않는다 (`qa:newsletter`가 `out/`을 검사한다).
- 구독자 목록을 사이트에 공개하거나 정적 파일로 만들지 않는다.
- 로그에 이메일 전체를 남기지 않는다. 오류 응답에 공급자 내부 정보를 담지 않는다.
- API 키·도메인이 없어 실제 호출을 못 하는 단계는 성공으로 처리하지 않는다.
