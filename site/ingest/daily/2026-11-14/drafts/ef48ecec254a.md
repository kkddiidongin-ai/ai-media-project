# 구글, Gemini 앱 내 파일 생성·편집·미리보기 기능 추가

> 🤖 **AI 초안 — 편집자 검토 전, 발행 승인 아님.** 자동 QA ⚠️ **REVIEW** · 유형 STANDARD (근거 기준 최대 STANDARD) · 후보 `ef48ecec254a`

**핵심 요약** 구글은 Gemini 앱 내에서 문서, 스프레드시트, 프레젠테이션 등 다양한 파일을 직접 생성하고 편집 및 미리보기 할 수 있는 기능을 도입했다.

**무엇이 달라졌나** (공식 발표로 확인된 사실)
- Gemini 앱 내에서 문서를 생성하거나 텍스트를 강조하여 수정 요청을 할 수 있으며, 전체 화면 편집 및 미리보기 기능을 지원한다 [E4]. `E4`
- PDF는 웹과 모바일 모두에서 미리보기와 편집이 가능하지만, 문서, 스프레드시트, 프레젠테이션, 마크다운, TXT, 코드 파일은 웹 환경에서만 지원된다 [E5]. `E5`
- 프레젠테이션 내용을 생성하여 레이아웃을 미리 본 뒤 수정하거나 Google Slides로 내보낼 수 있으며, 시트 또한 데이터 모델을 생성하고 Google Sheets로 바로 열 수 있다 [E6], [E7]. `E6,E7`
- 해당 기능은 Gemini 앱이 지원되는 모든 언어와 모든 사용자에게 공개되었다 [E9], [E11]. `E9,E11`

**왜 중요한가** (AI마중의 해석)
Gemini 대화창에서 파일을 직접 수정하고 외부 도구로 연동하는 과정을 통합하여, 문서 작성부터 최종 문서화까지의 작업 흐름 효율성을 높이려는 것으로 풀이된다. `E4,E6,E7`

사용자는 생성형 AI가 작성한 내용을 별도의 파일로 복사할 필요 없이 Gemini 앱 내에서 즉시 수정하고 최종 문서 형태로 변환하거나 드라이브에 저장할 수 있다. `E4,E8`

**독자가 확인할 사항**
- PDF를 제외한 문서, 시트, 슬라이드 등 대부분의 파일 형식 편집은 웹 버전 Gemini에서만 지원된다. `E5`
- Gemini 앱의 활성화 여부나 설정은 고객센터를 통해 확인할 수 있다. `E10`

**아직 확인되지 않은 부분**
- Gemini 요금제별 기능 제한 여부
- 특정 국가에서의 사용 제한 가능성(공식 보도에는 전 세계 지원으로 명시되었으나, 실제 서비스 적용 시점은 국가별로 차이가 있을 수 있음)

**출처 및 확인 범위**
- 원문: [Google Workspace Updates — Create, preview, and edit files directly in the Gemini app](https://workspaceupdates.googleblog.com/2026/10/create-preview-and-edit-files-directly-in-the-Gemini-app.html) · 발표 2026-10-29
- 확인 범위: 원문 OK · 근거 문장 13개(원문 발췌 12) · 확인 2026-11-14 13:26 UTC
- 직접 사용 여부: AI마중은 이 기능을 직접 써 보지 않았습니다 (공식 발표 기준)

---

## 자동 QA: ⚠️ REVIEW

| 항목 | 결과 | 내용 |
|---|---|---|
| FACT | ⚠️ REVIEW | 근거에서 찾지 못한 영문 이름 'E11' |
| EVIDENCE | ✅ PASS | - |
| EDITORIAL | ✅ PASS | - |
| STRUCTURE | ✅ PASS | - |
| DUPLICATE | ✅ PASS | - |
| SAFETY | ✅ PASS | - |

### 수정 필요 사항
- [FACT/REVIEW] 근거에서 찾지 못한 영문 이름 'E11'

### 근거 장부
- `E0` (feed) We’re introducing new ways to create and refine files and code in the Gemini app. You can now generate, preview, and edit files right within your Gemini app chat—expand to full screen to type edits directly, highlight text to ask questions, or have Gemini refine them. PDF preview and editing is supp
- `E1` (body) Google Workspace Updates: Create, preview, and edit files directly in the Gemini app
- `E2` (body) Create, preview, and edit files directly in the Gemini app
- `E3` (body) We’re introducing new ways to create and refine files and code in the Gemini app.
- `E4` (body) You can now generate, preview, and edit files right within your Gemini app chat—expand to full screen to type edits directly, highlight text to ask questions, or have Gemini refine them.
- `E5` (body) PDF preview and editing is supported on both the web and mobile, while all other formats (documents, spreadsheets, slide decks, Markdown files, TXT files, and code) are supported on the web only.
- `E6` (body) Generate and refine slide decks: Create presentation outlines or slide content, preview the layout in chat, and edit directly or ask Gemini to adjust the tone and structure before opening in Google Slides, or downloading as a PPTX or PDF.
- `E7` (body) Build and export Google Sheets: Generate structured trackers, tables, and data models from a prompt, preview them in Gemini, and open them directly in Google Sheets.
- `E8` (body) Edit documents and PDFs: Quickly draft PDFs, Google Docs, LaTeX, Markdown, or TXT files, and make manual or prompted edits inline on web or in a full-screen view—plus you can upload all of them to Drive.
- `E9` (body) These capabilities are now available to all users in all languages where the Gemini app is available.
- `E10` (body) Visit the Help Center to learn more about turning the Gemini app on or off .
- `E11` (body) End users: Users of all ages who have access to the Gemini app can generate files.
- `E12` (body) News from Google: You can now preview and edit documents, PDFs, presentations, spreadsheets, and more directly in Gemini

### 생성 정보
- gemini · 모델 gemini-3.1-flash-lite · 프롬프트 draft-v1
- 토큰 입력 1732 · 출력 742 · 예상 비용 $0.0000 · 생성 2026-11-14T13:27:38.306Z
- 승인: 편집자가 확인 후 `npm run daily:approve`
