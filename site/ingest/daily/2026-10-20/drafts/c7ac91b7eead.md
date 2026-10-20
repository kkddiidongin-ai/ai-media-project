# 구글, iOS용 스프레드시트에 제미나이 데이터 분석 기능 출시

> 🤖 **AI 초안 — 편집자 검토 전, 발행 승인 아님.** 자동 QA ✅ **PASS** · 유형 STANDARD (근거 기준 최대 STANDARD) · 후보 `c7ac91b7eead`

**핵심 요약** 구글이 웹과 안드로이드에 이어 iOS 기기용 구글 스프레드시트에도 제미나이 기능을 지원합니다. 2026년 10월 15일부터 점진 배포가 시작되었습니다.

**무엇이 달라졌나** (공식 발표로 확인된 사실)
- 웹과 안드로이드에 이어 iOS 기기의 구글 스프레드시트 앱에서도 데이터를 분석하고 파악하는 데 제미나이를 사용할 수 있게 되었습니다. `E0,E4`
- 자격이 있는 사용자의 경우 호환되는 스프레드시트를 열고 제미나이 아이콘을 눌러 이용할 수 있으며, 기본값으로 활성화됩니다. `E6,E7`
- 도메인 및 조직 단위(OU) 수준의 구글 워크스페이스용 제미나이 활성화 설정 외에 별도의 모바일 전용 관리자 제어 항목은 없습니다. `E5`
- 빠른 출시(Rapid Release) 및 계획 출시(Scheduled Release) 도메인을 대상으로 2026년 10월 15일부터 기능 노출까지 최대 15일이 걸리는 점진적 배포가 시작되었습니다. `E9`

**왜 중요한가** (AI마중의 해석)
데스크톱 웹과 안드로이드에 이어 iOS 기기까지 지원을 확대해 이동 중에도 스프레드시트 데이터를 빠르게 분석할 수 있도록 모바일 생산성 환경을 맞추려는 조치입니다. `E0,E4`

구글 워크스페이스에서 제미나이를 사용하는 조직의 iOS 사용자는 모바일 기기 스프레드시트 앱 내에서 제미나이 아이콘을 눌러 데이터 분석 기능을 직접 활용할 수 있습니다. `E5,E6,E7`

**독자가 확인할 사항**
- 기능 사용을 위해 조직 관리자가 도메인 또는 조직 단위에서 구글 워크스페이스용 제미나이를 활성화했는지 확인해야 합니다. `E5`
- 2026년 10월 15일부터 점진적 배포가 진행되므로 실제 계정에 기능 아이콘이 보이기까지 최대 15일이 걸릴 수 있습니다. `E9`

**아직 확인되지 않은 부분**
- 구체적으로 어떤 워크스페이스 요금제나 추가 라이선스를 보유해야 대상 사용자(eligible users)로 분류되는지 근거에 명시되지 않았습니다.
- iOS 앱의 제미나이 기능이 한국어 프롬프트나 한국어 데이터를 정상 지원하는지 여부는 확인되지 않았습니다.

**출처 및 확인 범위**
- 원문: [Google Workspace Updates — Gemini in Google Sheets is now available on iOS devices](https://workspaceupdates.googleblog.com/2026/10/gemini-in-google-sheets-is-now-available-on-iOS-devices.html) · 발표 2026-10-19
- 확인 범위: 원문 OK · 근거 문장 13개(원문 발췌 12) · 확인 2026-10-20 01:04 UTC
- 직접 사용 여부: AI마중은 이 기능을 직접 써 보지 않았습니다 (공식 발표 기준)

---

## 자동 QA: ✅ PASS

| 항목 | 결과 | 내용 |
|---|---|---|
| FACT | ✅ PASS | - |
| EVIDENCE | ✅ PASS | - |
| EDITORIAL | ✅ PASS | - |
| STRUCTURE | ✅ PASS | - |
| DUPLICATE | ✅ PASS | - |
| SAFETY | ✅ PASS | - |

### 수정 필요 사항
- 자동 점검에서 찾은 항목 없음 — 그래도 사람이 원문과 대조해 확인

### 근거 장부
- `E0` (feed) Building upon the power of Gemini in Sheets on the web and our recent launch on Android devices , we’re excited to announce that you can now use Gemini in Google Sheets on your iOS device to quickly analyze and understand your data while on the go. Simply tap on the Gemini spark icon, and you can as
- `E1` (body) Google Workspace Updates: Gemini in Google Sheets is now available on iOS devices
- `E2` (body) This official feed from the Google Workspace team provides essential information about new features and improvements for Google Workspace customers.
- `E3` (body) Gemini in Google Sheets is now available on iOS devices
- `E4` (body) Building upon the power of Gemini in Sheets on the web and our recent launch on Android devices , we’re excited to announce that you can now use Gemini in Google Sheets on your iOS device to quickly analyze and understand your data while on the go.
- `E5` (body) Admins: There is no specific admin control for this mobile feature beyond the general Gemini for Google Workspace enablement at the domain/OU level.
- `E6` (body) End users: This feature will be available by default for eligible users.
- `E7` (body) To access it, open a compatible spreadsheet on your iOS device and tap the Ask Gemini icon.
- `E8` (body) Visit the Help Center to learn more about using Gemini in Google Sheets .
- `E9` (body) Rapid Release and Scheduled Release domains: Gradual rollout (up to 15 days for feature visibility) started on October 15, 2026
- `E10` (body) Google help article: Collaborate with Gemini in Google Sheets
- `E11` (body) On the “What’s new in Google Workspace?” Help Center page, learn about new products and features launching in Google Workspace, including smaller changes that haven’t been announced on the Google Workspace Updates blog.
- `E12` (body) Discover how a diverse range of organizations, from small businesses and nimble startups to globally recognized Fortune 500 corporations, leverage the collaborative power of Google Workspace.

### 생성 정보
- gemini · 모델 gemini-3.8-flash · 프롬프트 draft-v1 · 이전 생성 재사용(추가 호출 없음)
- 토큰 입력 1690 · 출력 840 · 예상 비용 $0.0000 · 생성 2026-10-20T01:05:40.920Z
- 승인: 편집자가 확인 후 `npm run daily:approve`
