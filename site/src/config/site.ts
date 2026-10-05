/**
 * 사이트 전체 설정 — 브랜드명·태그라인·URL은 여기서만 바꾼다.
 * 브랜드명은 아직 확정되지 않았다 (brand/naming-deep-dive.md). 아래 name은 임시값이다.
 */
export const siteConfig = {
  /** 임시 브랜드명. 확정되면 이 값만 바꾼다. */
  name: "AI 실용 미디어(가칭)",
  /** 헤더 로고 자리에 쓰는 짧은 이름 */
  shortName: "AI 실용 미디어",
  /** 브랜드명 아래 작은 설명 */
  descriptor: "공식 원문으로 확인한 AI 변화",
  /** 대표 태그라인 (가안) */
  tagline: "AI, 확인한 만큼만 말합니다",
  description:
    "OpenAI, Anthropic, Google 등 AI 회사들의 공식 발표를 날짜별로 확인하고, '그래서 나한테 뭐가 달라지는지'를 쉽게 정리하는 AI 미디어입니다.",
  /** 배포 도메인이 정해지면 바꾼다. canonical·sitemap·OG에 쓰인다. */
  url: "https://example.com",
  locale: "ko_KR",
  /**
   * 공개 전 미리보기: 화면 아래 얇은 안내 줄을 띄우고 검색엔진 색인을 막는다 (robots noindex, robots.txt Disallow).
   * 배포·도메인이 정해져 실제 공개할 때 false로 바꾼다.
   */
  isPreview: true,
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
