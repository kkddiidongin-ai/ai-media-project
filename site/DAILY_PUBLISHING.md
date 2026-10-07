# AI마중 DAILY 발행 절차

역할: **ChatGPT** = 후보 선정·사실 확인·원고 확정 / **Claude Code** = 아래 구조로 반영·검증·배포.
자동 수집·자동 작성·자동 발행은 하지 않는다. 모든 명령은 `site/`에서 실행한다.

## 1. 기사 품질 기준 (과거 기사·신규 기사 공통)

등급은 글자 수가 아니라 **중요도와 독자에게 필요한 맥락**으로 정한다. 분량은 권장값일 뿐, 근거 없는 문장으로 채우지 않는다.

| 등급 | 목적 | 독자가 알 수 있어야 하는 것 | 권장 분량 |
|---|---|---|---|
| SHORT | 빠른 사실 전달·기록 | 무슨 일 / 핵심 변화 / 누구에게 영향 / 출처 | 150~350자 |
| STANDARD | 변화의 의미까지 | + 이전 상태 / 정확히 달라진 점 / 조건·수치 / 사용자·시장 영향 / 필요하면 AI마중 POINT | 400~800자+ |
| DEEP | 중요한 변화를 맥락·근거로 | + 배경 / 수치·조건·기능 / 왜 중요한가(해석) / 실제 사용자 영향 / 한국 사용자 영향(있으면) / 한계·미확인 / 추가 출처 | Phase 6.4.1 Pilot 구조 |

공통: 사실과 AI마중 해석을 나눈다. 회사 주장은 "~라고 밝혔습니다", "~에 따르면"으로 귀속한다. 제목을 되풀이한 요약, "변화는 없습니다" 한 줄짜리 영향 설명은 쓰지 않는다.

## 2. 순서

1. **후보 선정** (ChatGPT): 공식 원문이 있는 발표만. 일자가 확인되지 않으면 싣지 않는다.
2. **사실·출처 최종 검수** (ChatGPT): 수치·날짜·가격·제품명을 원문과 대조. 원문 URL·발표일·확인일 확정.
3. **등급 결정** (ChatGPT): 위 표 기준으로 SHORT / STANDARD / DEEP 중 하나를 확정해 원고에 적는다. 자동 판정에 맡기지 않는다.
4. **데이터 입력** (Claude Code) — 아래 3절.
5. **slug 중복 확인**: `grep -rn '"slug": "<slug>"' ingest/editorial` 결과가 없어야 한다 (publish도 중복이면 멈춘다).
6~8. **publish → validation → build**: `npm run publish:daily`
   (= `publish:stories` → `qa:content` → `tsc --noEmit` → `lint` → `build` → `qa:routes`, 하나라도 실패하면 거기서 멈춘다)
9. **git**: `git add -A site/ingest site/content` → `git commit -m "content: YYYY-MM-DD daily"` → `git push origin master` (force push 금지)
10. **배포·확인**: `npx vercel deploy --prod --yes` → https://aimajung.com 에서 홈 최신 뉴스레터와 새 기사 1건을 연다.

## 3. 입력 위치와 형식

기사 1건 = **후보 기록 1개 + 편집 항목 1개** (+ DEEP이면 심층 파일 1개). 출처 정보는 후보 기록에서만 가져온다.

**(1) 후보 기록** — `ingest/candidates/YYYY-MM.json` (원문 발표 월) 배열에 추가.
id는 `node -e "import('./scripts/ingest/lib.mjs').then(m=>console.log(m.candidateId('<원문 URL>')))"` 로 만든다.

```json
{ "id": "<12자리>", "url": "<원문 URL>", "canonicalUrl": "<원문 URL>", "title": "<원문 제목>",
  "description": "<원문 첫 문단 요약(번역·복사 금지, 짧게)>", "publishedAt": "2026-10-06T00:00:00.000Z",
  "sourceId": "manual", "sourceName": "<예: Anthropic>", "sourceType": "official", "tier": 1,
  "fetchMode": "manual", "discoveredVia": "chatgpt-daily", "discoveredAt": "<입력 시각 ISO>",
  "runId": "daily-YYYY-MM-DD", "status": "candidate" }
```
보도(언론) 출처면 `sourceType: "press"`.

**(2) 편집 항목** — `ingest/editorial/YYYY-MM.json` (발표 월) 배열에 추가. 모든 등급 공통.

```json
{ "c": "<후보 id>", "slug": "<영문-소문자-하이픈>", "title": "<제목>", "summary": "<한 문장 리드>",
  "cat": "MODEL_RELEASE", "topics": ["anthropic", "claude"], "companies": ["Anthropic"], "products": ["…"],
  "facts": ["<핵심 사실>", "…"], "why": "<왜 중요한가 = AI마중 해석>", "change": "<그래서 나한테는? 누구에게 무엇이>",
  "prio": 2, "secondary": ["<추가 출처 후보 id>"], "editorialDepth": "SHORT" }
```
- `cat`은 `scripts/ingest/publish.mjs`의 CATEGORIES, `topics`는 `content/topics.json`에 있는 값만.
- 원문 발표일과 사건일이 다르면 `"eventDate": "YYYY-MM-DD"`를 넣는다.
- 추가 출처도 후보 기록으로 넣고 id를 `secondary`에 적는다.
- **`editorialDepth`: `SHORT` | `STANDARD` | `DEEP` — 신규 기사는 반드시 적는다.** 다른 값이면 publish가 멈춘다.
  `DEEP`은 `deep/<slug>.json`이 있어야 하고, 심층 파일이 있는데 `DEEP`이 아니어도 멈춘다 (값만 DEEP으로 적어 심층 기사가 되지 않음).
  STANDARD는 사실 2개 이상·이전 상태·영향을 갖춰 쓴다. 갖출 근거가 없으면 SHORT로 낸다 (등급에 글을 맞추지 않는다).
- 값이 없는 과거 기사만 예전 자동 판정(`prio 3 · 사실 1개 · 추가 출처 없음` → SHORT, 그 밖 → STANDARD)을 쓴다.

**(3) DEEP 심층 파일** — `ingest/editorial/deep/<slug>.json`

```json
{ "slug": "<slug>", "lead": "<2~3문장>", "facts": ["3~5개"],
  "sections": [ { "role": "what|before|change|point|users|open", "heading": "<제목>", "paragraphs": [], "bullets": [] } ],
  "references": [ { "sourceName": "", "sourceTitle": "", "sourceUrl": "", "sourcePublishedAt": "", "checkedAt": "YYYY-MM-DD", "note": "" } ] }
```
`what`·`users`·`open` 섹션 필수, 4개 이상. `point` = AI마중 해석. `open` = 아직 확인되지 않은 것. references에는 원문·추가 출처와 다른 URL만.

## 4. 중단 기준 (하나라도 해당하면 발행하지 않는다)

- 원문 URL이 열리지 않거나, 날짜·수치를 원문에서 확인하지 못함
- `publish:daily`의 어느 단계든 실패 (오류를 고친 뒤 처음부터 다시)
- qa:content의 반복 문장 오류 → 문장을 기사에 맞게 다시 쓴다 (경고 `eventDate ≠ 원문 발표일`은 의도한 경우만 허용)
- 배포 후 홈·새 기사 페이지가 열리지 않음 → 직전 커밋으로 되돌리는 커밋을 만들어 다시 배포 (force push 금지)

## 5. 기존 기사 보강

`npm run qa:quality -- --write` 가 `ingest/review-queue.json`(보강 대상 목록)을 다시 만든다.
보강은 원문을 다시 확인한 뒤(`needsSourceRecheck: true`) 해당 편집 항목·심층 파일을 고치고 2절 6~10을 따른다.
