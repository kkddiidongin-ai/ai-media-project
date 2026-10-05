# AI 실용 미디어(가칭) — 웹사이트 (Phase 6.3)

2026년 AI의 실제 변화를 공식 원문으로 확인해 날짜별로 쌓는 AI 미디어. 기획 문서는 상위 폴더(`../strategy`, `../brand`)에 있다.

- Next.js 16 (App Router) + TypeScript + Tailwind CSS 4, **정적 빌드** (`output: "export"` → `out/`)
- 구조: **INGEST(수집) → content/(로컬 DB) → BUILD**. 빌드는 외부 사이트에 접속하지 않는다.

## 명령

```bash
npm run dev              # 개발 서버 http://localhost:3000
npm run build            # 정적 빌드 → out/
npx tsc --noEmit         # 타입 검사
npm run lint             # ESLint

npm run backfill:2026    # 2026-01-01~오늘 후보 수집 (공식 RSS·공개 sitemap)
npm run ingest:news      # 증분 수집: 소스별 마지막 수집 3일 전부터 (중복은 자동 제외)
npm run publish:stories  # 편집 원고(ingest/editorial) + 후보 기록 → content/stories
npm run qa:content       # 중복·날짜·주제·연결·출처 추적 점검
npm run qa:sources       # 원문 링크 점검 (깨짐 / 봇 차단 구분)
node scripts/ingest/list.mjs 2026-09        # 편집용 후보 목록
node scripts/ingest/show.mjs <id>,<id>      # 후보 설명 보기
```

## 파이프라인

```
ingest/registry.json        Source Registry (id, name, officialUrl, feedUrl, sourceType, tier, fetchMode, enabled, note)
        ↓ scripts/ingest/run.mjs      Fetch (robots.txt 확인, 호스트별 간격) → Normalize → Deduplicate (정규 URL 해시)
ingest/candidates/YYYY-MM.json  Candidate (제목·링크·발표일·짧은 설명·발견 경로·수집 시각·runId) — 본문 저장 안 함
ingest/log/*.json           실행 기록(Research Log), 링크 점검 기록
        ↓ 편집: 원문 확인 후 새로 쓰기 (사실 / 해석 분리)
ingest/editorial/YYYY-MM.json   편집 원고 (후보 id, 제목, 요약, 분류, 주제, 핵심 사실, 왜 중요한가, 무엇이 달라지나)
        ↓ scripts/ingest/publish.mjs  Verify (후보·주제·분류·중복·미래 날짜) → Publish
content/stories/YYYY-MM.json    사이트가 읽는 기사 DB (출처 정보는 후보 기록에서 자동 복사)
```

- robots.txt가 일반 크롤러나 AI 크롤러(anthropic-ai, ClaudeBot 등)를 막은 곳은 수집하지 않는다 (registry의 `enabled:false` + note).
- 뉴스레터 호는 기사 발생일(`eventDate`)로 자동 묶인다. 사건이 없는 날은 호가 없다. 소급 정리한 호는 화면에 정리일을 표시한다.

## 그 밖의 콘텐츠

| 파일 | 내용 |
|---|---|
| `content/topics.json` | 주제 목록 (회사·제품·분야) |
| `content/charts/*.json` | AI차트. `checkedAt`, `sources`, `basis`(비교 기준) 필수. 기준이 다른 숫자는 `list` 형식 |
| `content/cardnews/*.json` | 카드뉴스. 원천 기사(`storySlugs`) 필수. 지금은 `demo: true` |
| `src/lib/news.ts` | 로더 + 빌드 시 검증. AI톡 데이터 모델(`TalkThread`)도 여기 정의 |

## 메뉴 (Phase 6.3 IA)

뉴스레터 `/newsletters/` · AI차트 `/chart/` · AI톡 `/talk/` (COMING SOON) · AI강의 `/school/` (COMING SOON) · 협업문의 `/collab/` · 더보기: 주제별 `/topics/` · 내가 모은 글 `/saved/` (localStorage) · 카드뉴스 `/cardnews/` (DEMO) · YouTube `/youtube/` (COMING SOON)

기사 `/stories/[slug]/`, 검색 `/search/`, 편집·출처 원칙 `/method/`. 예전 주소(`/archive/` `/tasks/` `/weekly/` `/record/`)는 새 페이지로 넘겨 주는 호환 페이지만 남겼다.

## 설정

| 바꿀 것 | 파일 |
|---|---|
| 브랜드명·설명·도메인·연락처 | `src/config/site.ts` |
| 공개 전환 (미리보기 띠 제거, 검색 색인 허용) | `src/config/site.ts`의 `isPreview: false` |
| 메뉴·분류·ticker 주제 | `src/config/labels.ts` |
| 색상 | `src/app/globals.css`의 `@theme` |

## 보관

Phase 5/6의 SAMPLE 글과 예전 화면 코드는 `fixtures/phase6-samples/`로 옮겼다 (빌드·검사 제외). TEST/TRACK/CHECK/BRIEF/GUIDE는 `contentType`으로 남아 있다.
