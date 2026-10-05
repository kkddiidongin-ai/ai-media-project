/**
 * 독자에게 보이는 이름 (Phase 6.3 IA).
 * Reference(soonsal.com)의 메뉴 역할을 AI 미디어로 옮겼다:
 *   뉴스레터=매일의 원천 콘텐츠 / AI차트=숫자·구조 재설명 / AI톡=반응·토론 / AI강의=교육 확장 / 협업문의=B2B
 *   주제별=지식 아카이브 / 내가 모은 글=개인 보관함 / 카드뉴스=짧은 재가공 / YouTube=영상 확장
 */

export const mainNav = [
  { href: "/newsletters/", label: "뉴스레터" },
  { href: "/chart/", label: "AI차트" },
  { href: "/talk/", label: "AI톡" },
  { href: "/school/", label: "AI강의" },
  { href: "/collab/", label: "협업문의" },
] as const;

export const moreNav = [
  { href: "/topics/", label: "주제별" },
  { href: "/saved/", label: "내가 모은 글" },
  { href: "/cardnews/", label: "카드뉴스" },
  { href: "/youtube/", label: "YouTube" },
] as const;

/** 상단 ticker: 실제 주제 페이지로 가는 바로가기 (숫자는 이 사이트 DB의 기사 수) */
export const tickerTopicSlugs = ["chatgpt", "claude", "gemini", "copilot", "meta", "nvidia", "ai-agent", "ai-coding", "ai-security", "ai-chip", "ai-regulation"] as const;

/** 기사 분류 (Phase 6.3 §7의 월별 조사 카테고리) */
export const categoryLabels = {
  MODEL_RELEASE: { en: "MODEL RELEASE", ko: "모델 출시" },
  PRODUCT_UPDATE: { en: "PRODUCT UPDATE", ko: "제품 업데이트" },
  AI_AGENT: { en: "AI AGENT", ko: "AI 에이전트" },
  AI_CODING: { en: "AI CODING", ko: "AI 코딩" },
  AI_SEARCH: { en: "AI SEARCH", ko: "AI 검색" },
  IMAGE: { en: "IMAGE", ko: "이미지" },
  VIDEO: { en: "VIDEO", ko: "영상" },
  VOICE: { en: "VOICE", ko: "음성" },
  ROBOTICS: { en: "ROBOTICS", ko: "로보틱스" },
  CHIPS_INFRA: { en: "CHIPS · INFRA", ko: "칩·인프라" },
  BUSINESS: { en: "BUSINESS", ko: "비즈니스" },
  INVESTMENT: { en: "INVESTMENT", ko: "투자" },
  REGULATION: { en: "REGULATION", ko: "규제·정책" },
  COPYRIGHT: { en: "COPYRIGHT", ko: "저작권" },
  RESEARCH: { en: "RESEARCH", ko: "연구" },
  BENCHMARK: { en: "BENCHMARK", ko: "벤치마크" },
  SECURITY: { en: "SECURITY", ko: "보안·안전" },
  WORK: { en: "WORK", ko: "업무" },
  CONSUMER: { en: "CONSUMER", ko: "생활" },
} as const;

/** 차트 분류 (기사 분류 + 차트 전용) */
export const chartCategoryLabels: Record<string, string> = {
  PRICE: "가격",
  INVESTMENT: "투자",
  CHIPS_INFRA: "칩·인프라",
  MODEL_RELEASE: "모델 출시",
  CONSUMER: "사용자",
  RECORD: "수집 기록",
  LIFECYCLE: "종료·교체",
  ENTERPRISE: "기업 도입",
  SECURITY: "보안",
};

export const verificationLabels = {
  "primary-official": "공식 원문 확인",
  "primary+secondary": "공식 원문 + 추가 출처",
  "press-only": "언론 보도 (공식 원문 미확인)",
} as const;

export const sourceTypeLabels = { official: "공식", press: "보도" } as const;

export const topicKindLabels = { company: "회사", product: "제품", theme: "분야" } as const;

export const weekdayLabels = ["일", "월", "화", "수", "목", "금", "토"] as const;

export const demoLabel = "DEMO";
export const comingSoonLabel = "COMING SOON";
