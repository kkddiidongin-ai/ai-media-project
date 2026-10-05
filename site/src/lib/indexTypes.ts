/** /search-index.json 한 항목 (검색·내가 모은 글이 함께 쓴다). 주제 이름·분류 한글명은 페이지가 따로 넘겨 색인 크기를 줄인다 (Phase 6.4) */
export interface StoryIndexItem {
  slug: string;
  title: string;
  summary: string;
  eventDate: string;
  categoryEn: string;
  topics: string[];
  companies: string[];
  products: string[];
  sourceName: string;
}
