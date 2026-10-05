# ai-media-project

일반인(30~60대, 비전문가)을 위한 **"AI 콘텐츠 + 실전 활용 + 교육"** 미디어/플랫폼 프로젝트.

> 현재 단계: **Phase 6 — MVP 웹사이트 구축 완료, 사용자 검토 대기** (2026-09-29) → [site/](site/) ([site/README.md](site/README.md))
> 브랜드명은 미확정이라 임시값("AI 실용 미디어(가칭)")으로 운영하며, `site/src/config/site.ts` 한 곳에서 바꾼다. 모든 글은 예시(SAMPLE)다.
>
> Phase 5B.1 Naming Deep Dive 비교 후보: 해보고서 / 해보는중 / 막상 → [brand/naming-deep-dive.md](brand/naming-deep-dive.md) (5B.2는 진행하지 않음)
> Phase 5B 브랜드 전략은 승인됨 (Essence "해본 만큼", 대표 태그라인 가안 "AI, 해본 만큼만 말합니다") → [brand/](brand/)
> Phase 5A 사이트 IA는 승인됨 → [strategy/site-ia.md](strategy/site-ia.md)
> Phase 4 Media Engine은 승인됨 (시간·발행량 숫자는 초기 실측 후 조정할 가설)
> Phase 3 Positioning은 승인됨: 과제 중심 AI 실용 미디어 ("사람이 실제로 하는 일을 중심으로, AI를 쓰면 어떻게 달라지는지 직접 확인한 만큼 보여준다") → [strategy/positioning.md](strategy/positioning.md)
> Phase 4: [strategy/media-engine.md](strategy/media-engine.md) · [content/editorial-workflow.md](content/editorial-workflow.md) · [content/editorial-calendar-simulation.md](content/editorial-calendar-simulation.md)
> Phase 1(시장조사, 수요 신호 검증)은 사용자 승인으로 종료되었습니다.
> Phase 2 인터뷰 설계는 완료했지만 실제 인터뷰는 아직 하지 않았습니다. 최종 타깃도 정하지 않았습니다.
> Phase 2B에서 미디어의 정체성, 카테고리·형식, 신뢰·재방문 구조, 편집 정책, 초기 콘텐츠 후보 50개, 오픈 세트를 제안했습니다.
> 사이트 개발·브랜드명·회원/결제 시스템은 아직 시작하지 않았습니다.

## 폴더 구조

```
ai-media-project/
├─ README.md                       ← 이 파일 (프로젝트 안내)
├─ PROJECT_CONTEXT.md              ← 목적, 제약, 원칙, 단계별 진행 상황
├─ research/
│  ├─ phase1-market-research.md    ← Phase 1 시장조사 본문 (산출물 1~10, 13~17, 19~20)
│  ├─ ai-monetization-landscape.md ← AI 수익화 시장 추가 조사 (Taxonomy, 24개 기준 평가, 검증 표준, Editorial Rule)
│  ├─ phase1-demand-validation.md  ← Gap별 수요 신호 검증, G5 심층, G1 획득 역설, Phase 2 우선 가설 P1~P5
│  ├─ phase2-target-hypotheses.md  ← [Phase 2] 사용자 분류(Stage×Context×Problem), 세그먼트 후보, P1~P5·경로 A/B/C 검증 구조
│  ├─ phase2-interview-guide.md    ← [Phase 2] 표본 설계, 스크리너, Consumer·Buyer 인터뷰 질문, 동의·개인정보
│  └─ phase2-interview-template.md ← [Phase 2] 인터뷰 증거 기록 양식, 집계표
├─ strategy/
│  ├─ opportunity-gaps.md          ← Opportunity Gap, 브랜드 방향 후보, 종료조건 자기점검 (산출물 11, 12, 18)
│  ├─ target-selection-framework.md ← [Phase 2] 타깃 평가 틀(점수 미입력), Founder Input 템플릿
│  ├─ content-media-architecture.md ← [Phase 2B] 미디어 정의, 카테고리·형식, 표준 구조, 신뢰·재방문, 연구 이력, 발행 운영안
│  ├─ editorial-policy.md          ← [Phase 2B] AI 활용 편집 정책 (허용/금지, 실험·개인정보·이해관계·정정)
│  ├─ positioning.md               ← [Phase 3] 경쟁 유형 비교, 후보 5개, 권고 Positioning, 확인 수준, Statement, Claim→Proof, 운영자 표현 사다리
│  ├─ media-engine.md              ← [Phase 4] 엔진 순환 구조, 관계 모델, Cluster, Journey, Source, 선정 규칙, 상태, Freshness·버전, TRACK, 증거 보관, MUST/SHOULD/LATER
│  └─ site-ia.md                   ← [Phase 5A] IA 모델, MVP·Growth Sitemap, 내비게이션, 홈·글·카드·과제 허브 구조, Trust UX, 확인 기록, 주간 노트, 검색 단계, 메타데이터, URL, 모바일, 회원 기능 판단
├─ brand/
│  ├─ brand-strategy.md            ← [Phase 5B] Brand Core, 속성 4개, 피할 이미지, 확장 원칙, 운영자 표기, 시각 방향(언어로만)
│  ├─ naming.md                    ← [Phase 5B] 네이밍 방향 6개, 후보 36→13개, 검색 검증, Shortlist 3개 (최종 승인 안 됨)
│  ├─ naming-deep-dive.md          ← [Phase 5B.1] 94개 탐색 → Longlist 20 → Shortlist 6, 문장·교육 테스트, 구글·네이버·도메인·YouTube 검증, 해보고서 집중 검증
│  └─ voice-and-language.md        ← [Phase 5B] 태그라인, Voice & Tone, 독자용 용어, 메뉴 라벨 검수, 홈 첫 화면 문구, 소개 초안
├─ content/
│  ├─ content-backlog.md           ← [Phase 2B] 초기 콘텐츠 후보 50개 (실제 글 아님)
│  ├─ launch-content-set.md        ← [Phase 2B] 오픈 세트 12편 + 연속 읽기 경로 (§6: Phase 3 재검수 교체안)
│  ├─ editorial-workflow.md        ← [Phase 4] 주간 리듬, 관리표·인박스·로그 양식, 형식별 체크리스트, 주간·월간 양식
│  └─ editorial-calendar-simulation.md ← [Phase 4] 가상 4주 편집 캘린더, 과부하·병목 검증 (실험 결과 없음)
├─ site/                           ← [Phase 6] MVP 웹사이트 (Next.js 16 + TypeScript + Tailwind, 정적 빌드)
│  ├─ src/config/                  ← 브랜드명·문구(site.ts), 독자용 이름(labels.ts)
│  ├─ src/app/                     ← 페이지 (홈, 과제, 글, 이번 주, 확인 기록, 확인 방법, 소개, 404)
│  └─ content/                     ← 과제·글·주간 노트 Markdown (현재 모두 SAMPLE)
└─ sources/
   └─ sources.md                   ← 출처 목록, 조사 기준일, 신뢰도 표기 규칙
```

## 신뢰도 표기 규칙 (모든 문서 공통)

| 표기 | 의미 |
|---|---|
| **[FACT]** | 공식 출처 또는 신뢰도 높은 자료로 확인 |
| **[OBSERVED]** | 사이트를 직접 확인하여 관찰 (자체 주장 수치 포함 — "주장"으로 명시) |
| **[REPORTED]** | 언론/2차 자료에서 확인 |
| **[INFERENCE]** | 자료를 바탕으로 한 분석 |
| **[HYPOTHESIS]** | 우리 프로젝트의 가설 (검증 전) |

## 다른 프로젝트와의 관계

- `ai-lecture-project`(2시간 일반인 AI 입문 특강), `human-branding-project`와 향후 사업적으로 연결될 수 있으나,
  이 폴더의 작업은 **ai-media-project 내부에서만** 수행합니다. 두 프로젝트의 파일은 읽거나 수정하지 않습니다.
