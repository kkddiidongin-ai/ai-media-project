# 발행 준비 — 신규 기사 3건 (v2 최종 검수)

> 최종 검수와 발행 준비까지만 했습니다. 기사 파일(content/stories)은 바꾸지 않았고, 발행·배포는 사용자 최종 승인 뒤에 합니다.

| 순위 | 판정 | 최종 제목 | slug | 발표일(eventDate) | 발행 예정일(publishedAt) | 원문 |
|---|---|---|---|---|---|---|
| 1 | 발행 가능 | 구글 Gemini 4 Argon 일반 공개… 유료 API와 Gemini 앱 Pro·Ultra부터 | `gemini-4-argon-general-availability` | 2026-10-13 | 승인 후 발행 실행일 (예: 2026-10-16) | [Google (The Keyword · AI)](https://blog.google/innovation-and-ai/models-and-research/gemini-models/introducing-gemini-4-argon/) |
| 2 | 발행 가능 | 메타, 에이전트용 모델 'Muse Wonder' 공개… API·Muse Code에서 먼저 | `meta-muse-wonder-frontier-models` | 2026-10-12 | 승인 후 발행 실행일 (예: 2026-10-16) | [Meta Newsroom](https://about.fb.com/news/2026/10/introducing-muse-wonder-models/) |
| 3 | 발행 가능 | Anthropic 'Claude Haiku 5.5' 출시… Haiku 4.5보다 평균 약 75% 싸게 | `claude-haiku-5-5` | 2026-10-07 | 승인 후 발행 실행일 (예: 2026-10-16) | [Anthropic](https://www.anthropic.com/claude-haiku-5-5) |

## 핵심 요약

- **구글 Gemini 4 Argon 일반 공개… 유료 API와 Gemini 앱 Pro·Ultra부터** — 구글이 10월 13일 Gemini 4 Argon을 개발자·기업과 Google AI Pro·Ultra 구독자에게 공개했습니다. 9월 30일 발표 때는 신뢰할 수 있는 사이버 방어자에게만 단계적으로 제공되던 모델입니다.
- **메타, 에이전트용 모델 'Muse Wonder' 공개… API·Muse Code에서 먼저** — 메타가 10월 12일 Muse Wonder와 Muse Wonder Full을 공개했습니다. 메타는 지금까지 만든 모델 가운데 가장 뛰어난 모델이라고 소개했으며, 개발자는 Meta Model API와 Muse Code에서 바로 쓸 수 있습니다. 일반 사용자용 Muse 앱 적용은 아직 '곧'으로만 예고됐습니다.
- **Anthropic 'Claude Haiku 5.5' 출시… Haiku 4.5보다 평균 약 75% 싸게** — Anthropic이 10월 7일 소형 모델 Claude Haiku 5.5를 출시했습니다. 요약·분류·서브에이전트처럼 빠르고 많이 처리해야 하는 작업용 모델로, Anthropic은 Haiku 4.5보다 평균 약 75% 적은 비용으로 돌릴 수 있다고 밝혔습니다.

## 검증 결과

- `gemini-4-argon-general-availability`: 9월 30일 발표와 10월 13일 발표의 차이 확인 · 일반 공개 범위 확인 · 유료 API 제공 조건 확인 · Gemini 앱 이용 대상 확인 · 한국 서비스 제공 여부 미확인 · 구글 자체 평가와 독립 평가 구분 구분함
- `meta-muse-wonder-frontier-models`: 모델의 정확한 용도 확인 · 공개 범위 확인 · 일반 사용자 이용 가능 여부 확인 — 아직 아님 · 벤치마크 및 가격 근거 수치·가격 없음 · 실제 발표일 확인
- `claude-haiku-5-5`: 모델 발표일 확인 (편집자 확인 표시) · API 가격 및 인하 기준 확인 · AWS 제공 범위 확인 · GitHub Copilot 지원 범위 확인 · 구독자 크레딧 지급 조건 확인

## v1 대비 수정

- Gemini: 가격이 9월 30일 발표분임을 명시하고 이번 새 정보(종료일 11월 30일)와 구분, 9/30 원문 인용 추가
- Gemini: '전 세계' 표현을 원문대로 공개 범위에 한정하고, 한국 Gemini 앱 이용 가능 여부를 '확인되지 않음'으로 본문에 명시 (구글 구독 안내 '일부 국가' 인용)
- Gemini: Vals Index 1위를 '구글 발표 기준, AI마중 미검증'으로 표기
- Muse Wonder: 제목에서 '최상위' 삭제, 일반 사용자는 아직 쓸 수 없다는 점을 요약·사실에 명시
- Muse Wonder: 연구 블로그를 추가 출처로 넣고 Prometheus 데이터센터 학습·벤치마크가 그래프로만 제시됐다는 점 반영
- Haiku 5.5: AWS 제공 범위(Bedrock·Claude Platform on AWS·지역별 데이터 보관)와 GitHub Copilot 범위(요금제·과금·순차 적용)를 별도 사실로 분리
- Haiku 5.5: 크레딧 지급 조건(7일 이상 가입, Console 조직 연결, 이월 없음, Free·Pro·Enterprise 제외, Team 좌석 합산)을 도움말 문서로 확인해 반영

## 승인 후 실행할 명령 (site/에서, 순서대로)

원고 파일은 PR #6 브랜치에만 있습니다. master에서 실행하려면 (a) PR #6을 merge하거나 (b) 원고 파일만 꺼내 씁니다:
`mkdir -p ingest/daily/backfill-2026-10-06_2026-10-15/drafts && git fetch origin && git show origin/automation/daily-backfill-2026-10-06_2026-10-10:site/ingest/daily/backfill-2026-10-06_2026-10-15/drafts/editorial-drafts.json > ingest/daily/backfill-2026-10-06_2026-10-15/drafts/editorial-drafts.json`

```bash
npm run daily:check-drafts -- ingest/daily/backfill-2026-10-06_2026-10-15/drafts/editorial-drafts.json
npm run daily:apply-drafts -- ingest/daily/backfill-2026-10-06_2026-10-15/drafts/editorial-drafts.json          # dry-run 확인
npm run daily:apply-drafts -- ingest/daily/backfill-2026-10-06_2026-10-15/drafts/editorial-drafts.json --apply  # 후보 8건 · 편집 항목 3건 추가
npm run publish:daily        # publish:stories → qa:content → tsc → lint → build → qa:routes (publishedAt = 이날)
npm run qa:quality && npm run qa:subscribers
git add site/ingest/candidates site/ingest/editorial site/content && git commit -m "content: 2026-10-16 신규 기사 3건"
git push origin master        # force push 금지
npx vercel deploy --prod --yes   # 별도 배포 승인 후
```

격리 시험(임시 복사본)에서 위 순서의 apply → publish → qa:content → qa:quality를 실행해 확인했습니다: 기사 722 → 725건, 기존 722건 변경 0, 새 3건 품질 PASS, 재실행 시 publishedAt 유지, 같은 원고 재적용은 중복으로 멈춤.

