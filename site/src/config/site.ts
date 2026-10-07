/**
 * 사이트 전체 설정 — 브랜드명·태그라인·URL은 여기서만 바꾼다.
 * 브랜드명 확정: AI마중 (2026-10-05).
 */
export const siteConfig = {
  name: "AI마중",
  /** 헤더 로고 자리에 쓰는 짧은 이름 */
  shortName: "AI마중",
  /** 메인 브랜드 메시지 — 헤더의 브랜드명 아래, 기본 title에 쓴다 */
  descriptor: "AI의 변화를 먼저 마중 나갑니다.",
  /** '마중'의 뜻을 풀어 주는 설명 (홈 첫 화면·소개) */
  intro: "매일 쏟아지는 AI 소식을 그대로 전하지 않습니다. 중요한 변화를 먼저 살펴보고, 직접 확인한 만큼 쉽게 전합니다.",
  /** 편집 원칙 (소개·편집 원칙 페이지) */
  tagline: "AI, 해본 만큼만 말합니다.",
  description:
    "AI의 변화를 먼저 마중 나가는 AI 미디어. OpenAI, Anthropic, Google 등 AI 회사들의 공식 발표를 날짜별로 확인하고, '그래서 나한테 뭐가 달라지는지'를 쉽게 정리합니다.",
  /** 공식 주소 (2026-10-07 aimajung.com 연결). canonical·sitemap·robots·OG·JSON-LD·뉴스레터 메일 링크가 모두 이 값을 쓴다 */
  url: "https://aimajung.com",
  locale: "ko_KR",
  /**
   * true면 공개 전 미리보기: 화면 아래 얇은 안내 줄을 띄우고 검색엔진 색인을 막는다 (robots noindex, robots.txt Disallow).
   * 2026-10-05 정식 공개로 false.
   */
  isPreview: false,
  operator: {
    name: "김동인",
  },
  /** 연락처가 정해지면 넣는다. null이면 "준비 중"으로 표시된다. */
  contactEmail: null as string | null,
  home: {
    /** 홈 '최근 AI 뉴스'에 보여줄 기사 수 */
    recentStories: 8,
    /** 홈 '지난 뉴스레터'에 보여줄 호 수 */
    pastIssues: 8,
  },
} as const;

export type SiteConfig = typeof siteConfig;
