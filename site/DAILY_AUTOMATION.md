# AI마중 DAILY 자동화 (Phase 7.1 · 7.1.1 선정 보정)

매일 아침 공식 AI 출처를 자동으로 모으고, 중복·가치·근거를 확인해 **승인 대기 결과**까지 만든다.
**기사 발행·배포·뉴스레터 발송은 자동으로 하지 않는다.** 사람이 보고서를 보고 승인한 것만 기존 발행 흐름(`DAILY_PUBLISHING.md`)으로 들어간다.

원칙: **AI, 해본 만큼만 말합니다.** 정보가 부족하면 발행하지 않는다. 0건인 날도 정상이다.

## 1. 전체 흐름

```
GitHub Actions (매일 07:00 KST 전후)
  └ npm run daily:run
      1) 수집      ingest/registry.json의 활성 공식 출처 (RSS·sitemap 메타·릴리스 노트, robots.txt 준수)
      2) 중복      기존 기사·후보·편집 원고와 비교 → NEW · UPDATE_EXISTING · DUPLICATE · UNCERTAIN
                   + 같은 날 다른 출처의 같은 발표는 하나만 남김 (나머지 DUPLICATE, alsoAt에 기록)
      3) 1차 판정  메타데이터만으로(비용 0): 글 유형 감점 · 사건 신호 → 우선순위 → 명백한 저가치 EXCLUDE
      4) 근거      우선순위 순 '근거 확인 명단'(원문 요청 상한 12) → 공식 원문 근거 장부 → 충분성·깊이 재평가
      5) 최종 추천 근거 통과 + 우선순위 기준 이상 → 최종 발행 추천 최대 6 (회사 다양성 부드러운 규칙)
      6) 원고      LLM 키가 있을 때만, 최종 추천에만: 근거 장부만 주고 SHORT·STANDARD 원고 (문장마다 근거 id)
      7) 검증      숫자·가격·이름·정식/프리뷰·한국 출시·회사 주장 출처·상대 날짜·중복을 근거와 대조
      8) 대기열    ingest/daily/<날짜>/ (run.json · candidates/<id>.json · report.md — 선정 진단 포함)
  └ automation/daily-<날짜> 브랜치에 커밋 → PR (본문 = 보고서)
사람
  └ PR의 보고서 검토 → npm run daily:approve -- <날짜> <id> → npm run publish:daily → 확인 → 커밋·푸시·배포
```

## 2. 매일 자동으로 하는 것 / 하지 않는 것

| 자동으로 함 | 자동으로 하지 않음 |
|---|---|
| 공식 출처 수집 (실패한 출처도 상태 기록) | master에 commit·push |
| 중복·가치 판정, 근거 수집, 깊이 제안 | `content/`·`ingest/editorial`·`ingest/candidates` 변경 |
| (키가 있으면) SHORT·STANDARD 원고 초안 | DEEP 원고 (DEEP은 제안만 — 사람이 심층 원고 작성) |
| 원고 검증과 확인 필요 항목 표시 | 승인 · 발행 · Vercel 배포 |
| 보고서 + `automation/daily-*` 브랜치 PR | 뉴스레터 Broadcast 생성·발송 (보고서에 '뉴스레터 후보' 표시만) |

## 3. 판정 기준

**중복** — `DUPLICATE`: 같은 원문 URL로 쓴 기사가 있거나 추가 출처로 쓰였거나 편집 원고에 쓰였거나, 원문 제목이 기존 기사와 거의 같음(0.75 이상).
`UPDATE_EXISTING`: 같은 출처의 구체적 제품(숫자·두 단어 이상 이름)에 '정식 제공·확대·출시 지역' 같은 후속 신호. `UNCERTAIN`: 같은 제품인데 후속 신호가 없거나 제목이 비슷함(0.45~0.75) — **자동 추천하지 않는다(HOLD)**.

**선정 (Phase 7.1.1, `scripts/daily/select.mjs`)** — '무엇을 기사로 고를지'
1. **글 유형 감점** (제목·발췌): 사용법·튜토리얼(-3) · 고객 사례(-3) · 업계 이야기(-2) · 의견·전망(-2) · 행사(-4) · 채용·인사(-4) · 문서·소소한 갱신(-2) · 홍보(-2) · 논문(-1).
   발췌에 발표 동사(introduces·now available …)가 있으면 '사용법'으로 보지 않는다. 감점 유형이라도 **강한 사건 신호**(모델 출시·가격·정식 제공/지역·인수/투자·규제/정책·보안 사건·한국)가 있으면 제외하지 않는다.
2. **사건 신호** → 중요도(0~5): 모델 출시 3 · 가격 3 · 인수/투자 3 · 규제/정책 3 · 한국 3 · 제품 출시 2 · 정식 제공/지역 2 · 실질적 파트너십 2~3 · 보안·안전 사건 2 · 주요 벤치마크/연구 결과 2 · 인프라/칩 2 · 프리뷰 1 · API/플랫폼 1 · 소비자 기능 1 · 일반 언급(모델·보안 단어) 1. 상위 3개 합 ÷ 2.
   **출처 등급·원문 접근 가능 여부는 중요도·우선순위에 넣지 않는다** (검증 신뢰도에만 반영).
3. **우선순위** = 중요도×2 + 실용성 + 한국 관련성 + 새로움 + 유형 감점. 4 이상이면 근거 확인 명단, 6 이상 + 근거 통과면 발행 추천 후보.
4. **언론 보도**(2차 출처)는 공식 발표로 확인될 때까지 HOLD (`press_only`).
5. **최종 추천 상한 6** — 근거를 본 '뒤'에 건다. 같은 회사는 2건까지 먼저 고르고, 3번째부터는 다른 회사의 남은 후보보다 우선순위가 3 이상 높을 때만 앞선다. 다른 회사 후보가 없으면 같은 회사 기사로 채운다 (억지로 끼우지 않음).

일자 미상(월 단위) 발표는 날짜를 지어내지 않고 HOLD.

**깊이** (기본값 STANDARD 없음). 원문 길이·문장 수는 **근거 충분성**에만 쓴다:
- 근거 충분성: 원문 600자 이상(LIMITED/PASS) + 서로 다른 확인 사실 4개 이상 → STANDARD까지 가능 · 확인 사실 2개 이상 → SHORT까지 · 그 미만 → 근거 부족 HOLD
- `STANDARD`: 충분성 STANDARD + (사용자 영향 또는 배경 맥락)
- `SHORT`: 그 밖에 충분성이 있는 경우
- `DEEP` **제안**: 7개 조건 모두 — 중요도 4+ · 새 사안 · 사용자 영향 · 배경 설명 필요(규제·보안 사건·파트너십·투자·가격·인프라·한국 중 하나 + 신호 2종 이상) · 서로 다른 확인 사실 6+ · 근거 PASS · STANDARD로는 중요한 맥락이 빠짐. **긴 페이지라는 이유만으로 DEEP이 되지 않는다.** DEEP은 자동 원고·자동 발행하지 않고 `deep_requires_editor`로 표시

**확인 필요 항목 (needsReview)**: `numeric_claim` 근거에 그대로 없는 숫자 · `price_unsupported` · `unsupported_name` · `rollout_uncertain` 정식/프리뷰 혼동 · `korea_claim_unsupported` · `company_claim_unattributed` 회사 주장 출처 없음 · `relative_date` · `duplicate_sentence` · `duplicate_uncertain` · `source_blocked` 원문 못 읽음 · `date_conflict` · `insufficient_evidence` · `deep_requires_editor`

### 선정 진단 (보고서의 Selection Diagnostics)
메타데이터 상위 10 · 근거 확인 명단(원문 상태·확인 사실 수·깊이) · 상한/다양성으로 빠진 후보 · 글 유형 감점 · DEEP 판단(충족/빠진 조건) · 보류 이유 집계. 왜 골랐고 왜 뺐는지 1~2분 안에 확인한다.

## 4. 승인하는 방법

1. PR(또는 `ingest/daily/<날짜>/report.md`)에서 발행 추천을 읽는다. 상세는 `candidates/<id>.json` (원고·근거 장부·검증 결과).
2. 원고와 근거를 대조해 확인 필요 항목을 직접 확인한다. 필요하면 대기열 파일의 `draft`를 고쳐도 된다 (근거 밖 사실은 넣지 않는다).
3. 승인 (PR 브랜치를 받아 로컬에서):
   ```
   npm run daily:approve -- 2026-10-07 <id> --dry-run                 # 검사만
   npm run daily:approve -- 2026-10-07 <id> --ack numeric_claim        # 확인한 항목을 --ack로 표시
   npm run daily:approve -- 2026-10-07 <id> --slug better-slug          # slug 바꾸기
   ```
   승인은 다음을 다시 검사한다: 원고 존재(mock 아님)·판정 PUBLISH·깊이 SHORT/STANDARD·검증 오류 없음·확인 항목 모두 ack·**지금 기준 중복**·**원문 재확인**(차단·404면 `--ack source_blocked` 필요)·slug.
   통과하면 `ingest/candidates/<월>.json`·`ingest/editorial/<월>.json`에 한 건씩 덧붙이고 `publish.mjs`를 돌린다(실패하면 되돌림).
4. `npm run publish:daily` (전체 QA·빌드) → diff 확인 → 커밋·푸시·배포는 사람이 직접. 다 쓴 DAILY PR은 닫는다(대기열 기록은 PR에 남는다).

## 5. GitHub Actions

`.github/workflows/daily-editorial.yml`
- 일정: `0 22 * * *` (UTC 22:00 = **KST 07:00**). GitHub의 schedule은 정시를 보장하지 않는다 — 부하에 따라 수 분~수십 분 늦거나 드물게 건너뛸 수 있다. 수동 실행(workflow_dispatch, 날짜 지정)도 된다.
- 순서: checkout → Node 24 → `npm ci` → 처리 기록 캐시 복원 → `npm run qa:daily`(고정 데이터 시험) → `npm run daily:run` → 캐시 저장 → 브랜치·PR.
- 브랜치: `automation/daily-<날짜>`. 같은 날짜를 다시 돌리면 **같은 브랜치에 커밋을 더하고 열린 PR 본문을 갱신**한다 (브랜치·PR이 늘어나지 않음). force push 없음. master로는 push하지 않는다.
- 처리 기록(`ingest/log/daily-processed.json`)은 Actions 캐시로 이어 쓴다 — 전날 다룬 URL을 다시 원고로 만들지 않는다 (캐시가 비면 다시 판정만 한다).

## 6. 필요한 설정 (GitHub → Settings)

| 종류 | 이름 | 값 | 필수 |
|---|---|---|---|
| Variable | `DAILY_AUTOMATION_ENABLED` | `true` (킬 스위치) | 실행하려면 필수 |
| Secret | `ANTHROPIC_API_KEY` | Anthropic API 키 | 원고 생성 시 (없으면 수집·판정·근거·보고서까지만) |
| Variable | `DAILY_LLM_PROVIDER` | `anthropic` · `none` | 선택 (기본: 키 있으면 anthropic) |
| Variable | `DAILY_LLM_MODEL` | 예: `claude-sonnet-5-5` | 선택 (기본값 같음) |
| Variable | `DAILY_MAX_PUBLISH`(최종 추천 수), `DAILY_MAX_EVIDENCE_FETCHES`(근거 확인 명단), `DAILY_MAX_LLM_CALLS` | 숫자 | 선택 (상한 이하로만, 7.1의 `DAILY_MAX_CANDIDATES`는 `DAILY_MAX_PUBLISH`로 읽음) |
| 저장소 설정 | Actions → General → Workflow permissions | **Read and write** + **Allow GitHub Actions to create and approve pull requests** | PR 생성에 필수 |

권장: master 브랜치 보호(직접 push 금지)를 켜 두면 워크플로가 실수로도 master를 바꿀 수 없다.

## 7. 비용·부하 상한 (`scripts/daily/lib.mjs`)

| 항목 | 기본 | 최대(HARD_CAPS) |
|---|---|---|
| 최종 발행 추천 (근거 확인 뒤) | 6 | 12 |
| 근거 확인 명단 = 원문 요청 | 12 | 25 |
| 하루 LLM 호출 (최종 추천에만) | 6 | 12 |
| 원고 최대 출력 토큰 | 2,500 | 4,000 |
| LLM 재시도 (5xx·429·시간 초과만) | 1 | 2 |
| LLM 시간 제한 | 60초 | — |
| 소스당 항목 | 20 | 40 |
| 같은 URL 재처리 | 처리 기록·같은 날 대기열 재사용으로 막음 | — |

수집 요청은 호스트별 간격(0.5~1.2초)·30초 시간 제한·robots.txt 준수. 403·429는 우회하지 않고 같은 호스트에서 두 번 실패하면 그날은 더 요청하지 않는다. 워크플로 전체 30분 제한.

## 8. 실행 상태와 실패 대응

`run.json`의 `status`:
- `SUCCESS` 모든 활성 소스 성공, 원고·검증 문제 없음
- `PARTIAL` 일부 소스 실패/차단/일부, 또는 원고 생성 건너뜀·실패, 또는 검증 실패가 있음 (결과는 정상적으로 남김)
- `FAILED` 활성 소스가 모두 실패 → 워크플로 실패로 표시

대응: 보고서의 '소스 상태'에서 실패 이유 확인 → 일시적이면 다음 날 자동 재시도, 계속되면 `ingest/registry.json`에서 해당 소스를 고치거나 `enabled: false`. LLM 생성 실패가 이어지면 `DAILY_LLM_PROVIDER=none`으로 원고 생성만 끈다.

## 9. 킬 스위치

- **즉시 전체 중단**: GitHub Variable `DAILY_AUTOMATION_ENABLED`를 `false`로 바꾸거나 지운다 → 워크플로 job이 건너뛰어진다 (코드 수정 불필요). 스크립트도 이 값이 정확히 `true`가 아니면 아무 요청 없이 끝난다.
- 원고 생성만 중단: `DAILY_LLM_PROVIDER=none`.
- 워크플로 자체 비활성화: Actions → AI마중 DAILY → Disable workflow.

## 10. 로컬 실행

```
DAILY_AUTOMATION_ENABLED=true npm run daily:collect -- --date 2026-10-07 --out ingest/log/daily   # 수집만
DAILY_AUTOMATION_ENABLED=true npm run daily:run -- --date 2026-10-07 --out ingest/log/daily       # 전체 (git 제외 폴더)
npm run qa:daily                                                                                  # 고정 데이터 시험 (외부 요청 없음)
```
`--out`을 생략하면 `ingest/daily/<날짜>/`에 쓴다 (PR용 위치).

## 11. Phase 7.2(자동 발행)를 열기 전에 확인할 조건

- 선정 보정(7.1.1) 이후 매일 보고서의 선정 진단으로 오선정·누락을 기록 (특히 사용법·사례 글이 추천에 남는지, 주요 발표가 빠지는지)
- 실제 LLM 원고로 최소 2~3주 운영: 발행 추천 대비 승인 비율, 사람이 고친 비율, 확인 필요 항목의 실제 오류 비율을 기록
- 검증기가 놓친 오류(사실·숫자·날짜·출시 범위) 0건이 일정 기간 유지
- 중복 판정 오탐·미탐 사례 점검 (특히 UPDATE_EXISTING·UNCERTAIN)
- 소스별 실패율과 원문 차단 소스(openai.com 등)의 근거 확보 방법 정리
- 자동 발행 범위를 SHORT + 확인 필요 항목 0건 + 공식 1차 출처로 한정하는 등 조건과 즉시 되돌리는 방법(롤백) 합의
- 비용(월 LLM 호출·토큰) 실측
