# Phase 5/6 구조 확인용 예시 (보관)

Phase 6.3(2026-10-01)에서 운영 화면에서 제거한 것들이다. 실제 2026 AI 콘텐츠와 섞지 않기 위해 여기에 보관한다.
빌드·타입 검사·린트 대상에서 제외되어 있다 (tsconfig `exclude`, eslint `globalIgnores`).

- `content/` — SAMPLE 글 13편, 과제 4개, 주간 노트 1호, 정정 기록
- `src/` — Phase 6~6.2-A의 홈·글·과제·주간·기록 페이지, 카드·날짜 묶음 컴포넌트, 마크다운 콘텐츠 로더(frontmatter 검증 포함)

## 보존한 콘텐츠 철학
TEST(직접 해봄) / TRACK(오래 써보기) / CHECK(주장 확인) / BRIEF(변화 확인) / GUIDE(알아두기)는
새 콘텐츠 모델의 `contentType`으로 남아 있다 (`src/lib/news.ts`). 지금은 외부 공식 발표 기반 기사만 있어 모두 `NEWS`이고,
AI MEDIA가 직접 실험한 글이 생기면 이 값을 쓴다. 내비게이션에는 노출하지 않는다.
