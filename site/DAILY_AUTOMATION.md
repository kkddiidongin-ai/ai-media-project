# AI마중 DAILY 자동화 (Phase 7.1 · 7.1.1 선정 보정 · 7.1.2 Shadow Mode · 7.1.3 AI 초안)

매일 아침 공식 AI 출처를 자동으로 모으고, 중복·가치·근거를 확인해 **승인 대기 결과**까지 만든다.
**기사 발행·배포·뉴스레터 발송은 자동으로 하지 않는다.** 사람이 보고서를 보고 승인한 것만 기존 발행 흐름(`DAILY_PUBLISHING.md`)으로 들어간다.

원칙: **AI, 해본 만큼만 말합니다.** 정보가 부족하면 발행하지 않는다. 0건인 날도 정상이다.

> **현재 운영 단계: Shadow Mode (7.1.2).** GitHub Actions는 매일 수집·중복·선정·근거 확인·보고서까지만 한다.
> LLM 원고 생성·기사 발행·뉴스레터·배포는 하지 않는다 (예약 실행은 `DAILY_MODE=shadow`, `DAILY_LLM_PROVIDER=none`, LLM 키를 넘기지 않음).
> **AI 초안(7.1.3)** 은 사람이 *Run workflow*에서 `mode=draft`를 고른 수동 실행에서만 만든다 (§13). 초안은 편집자 검토용이며 발행 승인이 아니다.

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

## 5. GitHub Actions (Shadow Mode)

`.github/workflows/daily-editorial.yml`
- 일정: `0 22 * * *` (UTC 22:00 = **KST 07:00**). GitHub의 schedule은 정시를 보장하지 않는다 — 부하에 따라 수 분~수십 분 늦거나 드물게 건너뛸 수 있다. 수동 실행(workflow_dispatch, 날짜 지정)도 된다.
- 순서: checkout → Node 24 → `npm ci` → 처리 기록 캐시 복원 → `npm run qa:daily`(고정 데이터 시험) → `npm run daily:run` (shadow) → 캐시 저장 → **Summary** → **artifact** → 브랜치·PR.
- 보고서가 남는 곳 (PR이 실패해도 앞의 두 곳에는 반드시 남는다):
  1. 실행 화면 **Summary** — report.md 본문
  2. **Artifact `daily-report-<날짜>`** — run.json · report.md · candidates/ (30일 보관). 같은 날짜의 예전 artifact는 지우고 하나만 둔다 (`actions: write` 권한이 없으면 지우기만 건너뜀)
  3. **브랜치 `automation/daily-<날짜>` + PR** — 권한이 있을 때만. 이 단계는 `continue-on-error`라 실패해도 실행 전체가 실패로 바뀌지 않는다 (로그에 경고)
- 같은 날짜 재실행: 같은 브랜치에 커밋을 더하고 열린 PR 본문을 갱신 (브랜치·PR이 늘지 않음). force push 없음. master로는 push하지 않는다. Shadow Mode라 LLM 호출은 0이다.
- 처리 기록(`ingest/log/daily-processed.json`)은 Actions 캐시로 이어 쓴다 — 전날 다룬 URL을 다시 원고로 만들지 않는다 (캐시가 비면 다시 판정만 한다).

## 6. 실제로 켜는 방법 (GitHub 화면에서 사람이 직접)

1. **Settings → Actions → General**
   - *Actions permissions*: Allow all actions and reusable workflows (또는 GitHub 공식 actions 허용 — `actions/checkout`·`setup-node`·`cache`·`upload-artifact`를 씀)
   - *Workflow permissions*: **Read and write permissions** 선택
   - **Allow GitHub Actions to create and approve pull requests** 체크 (PR을 받으려면 필요. 안 켜면 PR 단계만 실패하고 Summary·artifact는 남는다)
   - Save
2. **Settings → Secrets and variables → Actions → Variables 탭 → New repository variable**
   - Name `DAILY_AUTOMATION_ENABLED`, Value `true` → Add variable (이 순간부터 매일 22:00 UTC에 돈다)
3. 바로 확인: **Actions → AI마중 DAILY → Run workflow** (날짜 비우면 오늘) → 실행 화면 Summary와 Artifacts의 `daily-report-<날짜>` 확인
4. 끄기: 같은 Variable을 `false`로 바꾸거나 삭제 (job이 건너뛰어진다). 또는 Actions → AI마중 DAILY → ⋯ → Disable workflow
5. (권장) Settings → Branches → master에 보호 규칙 (직접 push 금지·PR 필요)

**다시 돌릴 때**: 실행 화면의 *Re-run jobs*는 그 실행 당시의 커밋(옛 코드)으로 다시 돈다. 코드를 고친 뒤에는 **Actions → AI마중 DAILY → Run workflow**(branch: master, 날짜 입력)로 돌린다. 같은 날짜면 같은 `automation/daily-<날짜>` 브랜치에 커밋을 더하고 열린 PR 본문을 갱신하며, 예전 artifact는 지운다. **PR은 자동으로 merge하지 않는다.**

**상한 Variable 주의 (2026-10-11 수정)**: 워크플로의 `${{ vars.DAILY_MAX_PUBLISH }}`처럼 없는 Variable은 빈 문자열로 넘어온다. 예전 코드는 이를 0으로 읽어 근거 확인·추천이 꺼졌다. 지금은 빈 값·숫자가 아닌 값은 기본값(추천 6, 근거 확인 12)을 쓰고, 상한이 0이면 보고서에 '설정 경고'를 띄우고 상태를 PARTIAL로 둔다. 명시한 `0`은 그대로 존중한다.

Shadow Mode에서는 **Secret이 필요 없다** (`ANTHROPIC_API_KEY`가 있어도 shadow 실행에는 넘기지 않는다. 수동 `mode=draft`에서만 넘긴다).

### 설정 값 목록

| 종류 | 이름 | 값 | 필수 |
|---|---|---|---|
| Variable | `DAILY_AUTOMATION_ENABLED` | `true` (킬 스위치) | 실행하려면 필수 |
| Secret | `ANTHROPIC_API_KEY` | Anthropic API 키 | 수동 draft 실행에만 (shadow에는 넘기지 않음). 없으면 초안 없이 안내 |
| Variable | `DAILY_LLM_MODEL` | `claude-sonnet-5-5`(기본) · `claude-opus-5-5` · `claude-fable-5-1` · `claude-haiku-5-5` | 선택. 목록에 없는 이름은 호출하지 않음 |
| Variable | `DAILY_LLM_EFFORT` | `low` · `medium`(기본) · `high` | 선택 |
| Variable | `DAILY_LLM_PRICE_INPUT`, `DAILY_LLM_PRICE_OUTPUT` | USD / 100만 토큰 | 선택 (기본은 확인한 공식 요금. haiku는 필수) |
| Variable | `DAILY_MAX_COST_USD` | 예: `0.5` | 선택 (하루 예상 비용 상한, 최대 3) |
| Variable | `DAILY_MAX_PUBLISH`(최종 추천 수), `DAILY_MAX_EVIDENCE_FETCHES`(근거 확인 명단), `DAILY_MAX_LLM_CALLS` | 숫자 | 선택 (상한 이하로만, 7.1의 `DAILY_MAX_CANDIDATES`는 `DAILY_MAX_PUBLISH`로 읽음) |
| 저장소 설정 | Actions → General → Workflow permissions | **Read and write** + **Allow GitHub Actions to create and approve pull requests** | PR 생성에 필수 |

권장: master 브랜치 보호(직접 push 금지)를 켜 두면 워크플로가 실수로도 master를 바꿀 수 없다.

## 7. 비용·부하 상한 (`scripts/daily/lib.mjs`)

| 항목 | 기본 | 최대(HARD_CAPS) |
|---|---|---|
| 최종 발행 추천 (근거 확인 뒤) | 6 | 12 |
| 근거 확인 명단 = 원문 요청 | 12 | 25 |
| 하루 LLM 호출 (최종 추천에만) | 6 | 12 |
| 원고 최대 출력 토큰 (사고 토큰 포함) | 3,000 | 4,000 |
| 하루 LLM 예상 비용 (호출 전 최악 비용으로 확인) | $0.50 | $3.00 |
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
- 원고 생성만 중단: 수동 실행에서 `mode=draft`를 고르지 않으면 된다 (예약 실행은 언제나 shadow). Secret `ANTHROPIC_API_KEY`를 지우면 draft도 초안 없이 끝난다.
- 워크플로 자체 비활성화: Actions → AI마중 DAILY → Disable workflow.

## 10. 로컬 실행

```
DAILY_AUTOMATION_ENABLED=true npm run daily:collect -- --date 2026-10-07 --out ingest/log/daily   # 수집만
DAILY_AUTOMATION_ENABLED=true npm run daily:run -- --date 2026-10-07 --out ingest/log/daily       # 전체 (git 제외 폴더)
npm run qa:daily                                                                                  # 고정 데이터 시험 (외부 요청 없음)
```
`--out`을 생략하면 `ingest/daily/<날짜>/`에 쓴다 (PR용 위치).

## 11. 백테스트 (`npm run daily:backtest`)

과거 날짜 D를 'D 07:00 KST(= D-1 22:00 UTC)에 돌았다면'으로 재현한다. **지금 피드를 그때의 완전한 데이터처럼 쓰지 않는다.**
- 항목: 보존된 피드 스냅숏(`scripts/daily/fixtures/2026-10-07-metadata.json`, 2026-10-07 15:30 UTC 수집) 중 실행 시각 이전 발표 + `ingest/candidates` 기록(사후 보존, origin 표시). 스냅숏 수집 창 이전 날짜는 '스냅숏 없는 날'로 표시하고 평가하지 않는다.
- 기존 기사: D 이전에 사람이 발행한 기사만.
- 근거 원문은 지금 다시 읽는다 (당시와 다를 수 있음). LLM 호출 없음.
- 평가: 사람이 발행한 기사(원 발표일이 창 안) 기준 recall · 사람이 발행하지 않은 추천 · 누락 이유 · 원문 차단 · 중복 판정. 결과는 `ingest/log/backtest/` (git 제외).
- Shadow Mode 보고서가 쌓이면 그날그날의 실제 피드가 artifact로 남으므로, 이후 백테스트는 그 보고서를 기준으로 하면 된다.

## 12. 원문이 막힌 출처 (OpenAI) — 2026-10-08 조사

우리 봇 이름(`AImajungBot`)으로, robots.txt를 먼저 보고, 막히면 요청하지 않는 조건에서:

| 문서 | 결과 |
|---|---|
| openai.com robots.txt | `User-agent: *` 허용 |
| openai.com 기사 (`/index/…`) | **403 · Cloudflare 챌린지** (`cf-mitigated: challenge`) — 서버가 봇을 막음. 챌린지 풀기·브라우저 위장은 하지 않는다 |
| help.openai.com 릴리스 노트 | 403 · Cloudflare 챌린지 |
| openai.com/news/rss.xml (공식 RSS) | 200 — 제목·짧은 설명(약 150자)·분류·날짜만, 본문(content:encoded) 없음 → 근거 한 줄(E0)뿐 |
| platform.openai.com/docs/changelog (공식 API 변경 기록) | 200 — 읽힘. 다만 본문 추출 시 날짜를 안정적으로 분리하지 못함 |
| github.com/openai/… 릴리스 피드 | robots.txt가 막음 → 요청하지 않음 |

적용 (`ALTERNATE_EVIDENCE`, `scripts/daily/lib.mjs`): OpenAI 원문이 막히면 API 변경 기록에서 **제목의 버전 붙은 이름**(예: GPT-6.1 Sol)이 그대로 나오는 줄만 근거로 쓰고 `alternate_evidence`(날짜·대응 사람 확인)로 표시한다. 대체 근거는 '본문 사실'로 세지 않아 최대 SHORT. 파트너십·연구·정책처럼 버전 이름이 없는 글은 맞는 줄이 없으므로 **HOLD** (확인 불가 사실은 쓰지 않는다). 사람이 브라우저로 원문을 확인해 수동 발행하는 것은 기존 흐름대로 가능하다.

## 13. AI 초안 (Draft Mode, Phase 7.1.3)

**모드** (`DAILY_MODE`, `scripts/daily/lib.mjs` `resolveMode`)
| 값 | 하는 일 | 쓰는 곳 |
|---|---|---|
| `shadow` (기본 — 값이 없거나 모르는 값도 shadow) | 수집·중복·선정·근거·보고서. LLM 0 | 매일 예약 실행 |
| `draft` | shadow + 검증된 발행 추천에 AI 초안 + 초안 QA | 사람이 *Run workflow*에서 `mode=draft`를 고를 때만. 예약 실행·다른 이벤트에서는 코드도 shadow로 바꾼다 |
| `publish` | 사용 금지 (Phase 7.2) — 아무것도 하지 않고 종료 코드 1 | — |

**초안 대상** (`draft.mjs` `draftEligibility`, 모두 충족해야 LLM 호출): 최종 PUBLISH · 중복 NEW 또는 기존 기사가 특정된 UPDATE_EXISTING · 원문 근거 OK(대체 문서만으로는 안 됨) · 원문 근거 문장 1개+·확인 사실 2개+ · https 원문 주소·발표일(일자) · 공식 출처 · DEEP 아님 (DEEP은 편집자가 직접). HOLD·EXCLUDE·UNCERTAIN은 만들지 않는다. **PUBLISH가 0건이면 LLM 호출 0.**

**기사 형식** (`providers.mjs` `buildPrompt`, 버전 `draft-v1`): 제목 · 핵심 요약 · 무엇이 달라졌나(A. 공식 확인 사실, 문장마다 근거 id) · 왜 중요한가(B. AI마중 해석) · 독자가 확인할 사항 · 아직 확인되지 않은 부분(C) · 출처 및 확인 범위(코드가 근거 장부로 작성, LLM이 쓰지 않음). SHORT 약 150~350자 · STANDARD 약 400~800자 — 길이는 REVIEW 신호일 뿐 합격 기준이 아니다.

**초안 QA** (`draft.mjs` `reviewDraft`) — 결과 PASS · REVIEW · FAIL
| 항목 | FAIL | REVIEW |
|---|---|---|
| FACT | 근거에 없는 수치·날짜·통화·'무료'·지역·API 제공, preview를 GA로, 모델명·버전 불일치(GPT-6 ≠ GPT-6.1, Sonnet 5 ≠ 5.5), 근거에 없는 제품 이름 | 근거에 GA 문구 없는 정식 제공 표현, 근거에서 못 찾은 영문 이름 |
| EVIDENCE | 근거 id 없음·잘못됨, 원문 미확인, 원문 주소·발표일 없음, LLM이 근거 부족이라고 답함 | 본문 근거 인용 없음, 수치가 인용한 근거가 아닌 다른 근거 문장에 있음 |
| EDITORIAL | — | 사실 칸의 추측·전망, 해석이 사실을 되풀이, 같은 문장 반복, 상대 날짜, mock 원고 |
| STRUCTURE | 필수 형식 오류, DEEP, 근거보다 깊은 유형(SHORT 근거에 STANDARD) | 제목 60자 초과, 확인 사항·미확인 부분 없음, 길이 범위 밖 |
| DUPLICATE | 기존 기사와 중복 | 같은 사안 불확실, 기존 기사 후속, 기존 기사 제목과 비슷함 |
| SAFETY | 직접 써 본·측정한 것처럼 쓴 문장(직접 써봄·직접 재봄·써 보니 …), 직접 사용 표시, 과장·광고성 제목, 근거 없는 시장 전망 | 출처 없는 최고·최초 주장, 과장 표현 |

- PASS도 **발행 승인이 아니다**. FAIL 초안은 판정을 HOLD로 바꿔 승인 대기에서 빼고, 원고는 오류 확인용으로만 남긴다 (`daily:approve`도 QA FAIL을 다시 검사해 거부).
- 초안에는 언제나 `handsOn: false` — '직접 써봄·직접 재봄' 표시는 실제로 시험한 기사에만 사람이 붙인다.

**저장** (Production `content/`에는 쓰지 않음): `ingest/daily/<날짜>/drafts/<id>.json`(후보 id·제목·출처·근거 요약·유형·원고·QA·수정 필요 사항·모델·토큰·비용·생성 시각) + `<id>.md`(사람이 읽는 초안). 보고서(PR 본문·Summary)에 'AI 초안' 표와 접힌 본문, artifact `daily-report-<날짜>`에 같은 파일.

**LLM 공급자** (`providers.mjs`): Anthropic Messages API (`anthropic-version: 2023-06-01`, `output_config.effort`, Sonnet 5.5는 `thinking: {type: "between_tools"}`로 앞단 사고를 끔). 모델·요금은 2026-10-11 공식 문서에서 확인한 값만 목록(`MODELS`)에 둔다 — Sonnet 5.5 입력 $2·출력 $10 / 100만 토큰. 비용 상한: 호출 수·출력 토큰·하루 예상 비용(호출 전 최악 비용) · 호출당 60초 · 429·5xx·시간 초과만 재시도 · 400·출력 잘림은 재시도 없음 · 한 후보 실패는 다른 후보를 막지 않음 · 키는 오류 문장에서도 지운다.

**중복 생성 방지**: 같은 날짜 재실행은 이전 대기열·`drafts/` 기록을 읽고, 근거 해시·프롬프트 버전·공급자·모델이 같으면 다시 부르지 않는다. GitHub에서는 'Restore earlier results' 단계가 `automation/daily-<날짜>` 브랜치의 이전 결과를 먼저 가져온다. shadow 재실행은 이미 만든 초안을 지우지 않는다. 다른 날짜에 이미 추천한 항목은 HOLD(carriedFrom).

**실제 API로 처음 돌리는 방법** (사용자 승인 뒤에만)
1. Settings → Secrets and variables → Actions → **Secrets** → `ANTHROPIC_API_KEY` 추가 (코드·로그·PR에 넣지 않는다. 로컬은 `.env.local`)
2. (선택) Variables: `DAILY_MAX_COST_USD`(예 `0.5`), `DAILY_MAX_LLM_CALLS`(예 `3`), `DAILY_LLM_MODEL`
3. Actions → AI마중 DAILY → **Run workflow** → branch `master`, 날짜, **mode `draft`**
4. PR `automation/daily-<날짜>`와 artifact의 `drafts/*.md` 확인 → 승인은 지금처럼 사람이 `npm run daily:approve` (PR은 자동 merge하지 않는다)

로컬: `DAILY_AUTOMATION_ENABLED=true DAILY_MODE=draft DAILY_LLM_PROVIDER=mock npm run daily:run -- --date <날짜> --out ingest/log/daily` (mock: 외부 요청·비용 없음, 승인 불가 원고).

## 14. Phase 7.2(자동 발행)를 열기 전에 확인할 조건

- 선정 보정(7.1.1) 이후 매일 보고서의 선정 진단으로 오선정·누락을 기록 (특히 사용법·사례 글이 추천에 남는지, 주요 발표가 빠지는지)
- 실제 LLM 원고로 최소 2~3주 운영: 발행 추천 대비 승인 비율, 사람이 고친 비율, 확인 필요 항목의 실제 오류 비율을 기록
- 검증기가 놓친 오류(사실·숫자·날짜·출시 범위) 0건이 일정 기간 유지
- 중복 판정 오탐·미탐 사례 점검 (특히 UPDATE_EXISTING·UNCERTAIN)
- 소스별 실패율과 원문 차단 소스(openai.com 등)의 근거 확보 방법 정리
- 자동 발행 범위를 SHORT + 확인 필요 항목 0건 + 공식 1차 출처로 한정하는 등 조건과 즉시 되돌리는 방법(롤백) 합의
- 비용(월 LLM 호출·토큰) 실측
