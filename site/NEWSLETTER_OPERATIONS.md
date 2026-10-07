# AI마중 뉴스레터 운영 문서

구독 신청 → Resend 연락처 저장 → 호 만들기 → 미리보기 → 테스트 발송 → 실제 발송까지의 흐름과 규칙.
자동 발송(cron)은 없다. 모든 발송은 사람이 명령을 실행해야 일어난다.

## 1. 구조

```
기사(content/stories) ──▶ 날짜별 호(issue) ──▶ 웹 (/newsletters/<date>/)
                                         └──▶ 메일 HTML·텍스트 (scripts/newsletter/lib.mjs)
구독 페이지 /newsletter/subscribe/ ──POST──▶ /api/newsletter/subscribe (Vercel Function) ──▶ Resend Contacts + Segment
```

- 사이트 본문은 지금처럼 정적 export(`out/`)다. 서버에서 도는 것은 `api/newsletter/subscribe.ts` 하나뿐이다.
  Vercel이 `site/api/` 폴더를 Function으로 배포한다 (Next.js의 `output: "export"`는 그대로).
- 메일은 웹 뉴스레터와 같은 데이터·같은 순서(사건 날짜 → priority → slug)로 만든다. 메일 전용 원고는 없다.
- 구독자 이메일은 Resend에만 저장한다. 사이트 저장소·정적 JSON·빌드 결과에는 구독자 정보가 없다.

| 파일 | 역할 |
|---|---|
| `src/config/newsletter.ts` | 발신자·Segment·발행인 정보(TODO), 관심 분야, 개인정보 안내 문구, 결과 문구 |
| `src/lib/newsletterSubscribe.ts` | 구독 처리 규칙 (검증·허니팟·요청 제한·중복·재구독), Resend 연결 |
| `api/newsletter/subscribe.ts` | Vercel Function 입구 (POST만) |
| `src/components/newsletter/SubscribeForm.tsx` | 구독 폼 (이메일·관심 분야·동의) |
| `src/app/newsletter/subscribe/`, `unsubscribe/` | 구독 페이지, 수신거부 안내 페이지 |
| `scripts/newsletter/lib.mjs` | 호 → 메일 HTML·텍스트, 발송 설정 검사 |
| `scripts/newsletter/*.mjs` | preview · test-send · send · setup · check |
| `ingest/newsletter-sent.json` | 초안·발송 기록 (날짜·제목·broadcast id만. 구독자 정보 없음) |

## 2. 처음 한 번 준비 (운영자)

1. **Resend 계정** — resend.com 가입. (Vercel Marketplace의 Resend 통합으로 만들어도 된다: `vercel integration add resend`.)
2. **발신 도메인 인증** — Resend → Domains에서 자체 도메인(예: `news.<도메인>`)을 추가하고 DNS(SPF·DKIM)를 등록해 `verified`로 만든다.
   `*.vercel.app`은 발신 주소로 쓸 수 없다. 사이트 도메인이 아직 없으면 도메인부터 마련해야 한다.
3. **Segment 만들기** — Resend → Audience(Contacts) → Segments에서 구독자용 Segment를 하나 만들고 ID를 적어 둔다.
   (Resend가 예전 'Audience'를 'Segment'로 바꿨다. 예전 Audience ID는 같은 ID의 Segment로 그대로 쓸 수 있다.)
4. **API 키** — Resend → API Keys에서 키를 만든다. 구독 Function용은 연락처 권한만, 발송 스크립트용은 Full access가 필요하다.
5. **환경변수** — 이름은 `.env.example` 참고.
   - 로컬: `.env.example`을 `.env.local`로 복사해 채운다 (`.env.local`은 git에 올라가지 않는다).
   - Vercel: Project Settings → Environment Variables에 `RESEND_API_KEY`, `RESEND_AUDIENCE_ID`를 Production에 넣고 다시 배포한다.
6. **점검·속성 만들기** — `npm run newsletter:setup -- --apply`
   API 키, Segment, 발신 도메인 인증, 관심 분야 속성(`interests`)을 확인하고, 속성이 없으면 만든다.
   **`interests` 속성이 없으면 구독 신청이 실패한다.**
7. **발행인 정보** — 메일 하단에 적을 정보(상호·연락처 등)를 `NEWSLETTER_OPERATOR_INFO` 또는 `src/config/newsletter.ts`에 넣는다. 임의로 채우지 않는다.

설정이 빠져 있으면 구독 API는 성공인 척하지 않고 503(`unavailable`)을 돌려주며, 화면에는 일반 오류 문구가 나온다.

## 3. 구독 처리 규칙

| 상황 | 응답 | 화면 문구 |
|---|---|---|
| 정상 (새 주소) | 200 `subscribed` | 구독 신청이 완료되었습니다. 다음 AI마중부터 이메일로 보내드릴게요. |
| 해지했던 주소 / Segment에 없던 연락처 | 200 `subscribed` (재구독) | 위와 같음 |
| 이미 구독 중 | 409 `duplicate` | 이미 AI마중을 구독하고 있는 이메일입니다. |
| 이메일 형식 오류 | 400 `invalid_email` | 이메일 주소 형식을 확인해 주세요. |
| 동의 없음 | 400 `consent_required` | 개인정보 수집·이용에 동의해야 구독할 수 있습니다. |
| 요청 과다 (IP당 10분 5회) | 429 `rate_limited` | 요청이 너무 많습니다… |
| 다른 사이트에서 온 요청 (Origin 불일치) | 403 `forbidden` | 일반 오류 |
| Resend 실패 · 설정 없음 | 502 `error` · 503 `unavailable` | 지금은 구독 신청을 처리하지 못했습니다… |
| 허니팟(숨은 칸) 채워짐 | 200 (저장 안 함) | — 봇에게 단서를 주지 않는다 |

- 저장 항목: 이메일, 관심 분야(연락처 속성 `interests`, 쉼표로 이은 key). 이름 등은 받지 않는다.
- 응답에는 code만 담는다. Resend 이름·오류 원문·키는 응답에 나가지 않는다.
- 로그에는 이메일 대신 해시 앞 10자리만 남는다 (`{"evt":"newsletter_subscribe","result":"subscribed","email":"3f2a…"}`).
- 요청 제한은 Function 인스턴스 메모리 기준이다 (인스턴스가 여러 개면 각자 센다). 스팸이 늘면 Vercel BotID·WAF 규칙이나 CAPTCHA를 더한다.
- 이중 확인(double opt-in)은 아직 없다. 다른 사람 주소를 넣는 문제가 생기면 확인 메일 단계를 더한다.

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

- `npm run qa:newsletter` — 외부 호출 없이 구독 처리 규칙(정상·형식 오류·동의 없음·중복·재구독·허니팟·API 실패·설정 없음·요청 제한·Origin)과 메일 렌더링(모든 호, 섹션 표시 조건, 수신거부, 이스케이프), 저장소·빌드 결과의 비밀값 여부를 시험한다.
- `npm run newsletter:preview -- --cases` — 최신 호, 긴 제목, 단신이 많은 날, 심층 메인, 8건 초과, 1건뿐인 날, 관련 기사 없는 날을 한 번에 만든다.

## 7. 보안 원칙

- `RESEND_API_KEY`는 `.env.local`과 Vercel Environment Variables에만 둔다. 코드·git·클라이언트 번들에 넣지 않는다 (`qa:newsletter`가 `out/`을 검사한다).
- 구독자 목록을 사이트에 공개하거나 정적 파일로 만들지 않는다.
- 로그에 이메일 전체를 남기지 않는다. 오류 응답에 공급자 내부 정보를 담지 않는다.
- API 키·도메인이 없어 실제 호출을 못 하는 단계는 성공으로 처리하지 않는다.
