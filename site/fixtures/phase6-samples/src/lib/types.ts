import type {
  disclosureLabels,
  effectLabels,
  formatLabels,
  relationLabels,
  taskGroupLabels,
  verdictLabels,
  verificationLabels,
  versionTypeLabels,
} from "@/config/labels";

export type Format = keyof typeof formatLabels;
export type VerificationMethod = keyof typeof verificationLabels;
export type Verdict = keyof typeof verdictLabels;
export type Effect = keyof typeof effectLabels;
export type Disclosure = keyof typeof disclosureLabels;
export type RelationType = keyof typeof relationLabels;
export type VersionType = keyof typeof versionTypeLabels;
export type TaskGroup = keyof typeof taskGroupLabels;

/** 콘텐츠 상태 (strategy/media-engine.md §8) */
export type Status = "idea" | "in_progress" | "published" | "tracking" | "needs_check" | "archived";
export type Freshness = "FAST" | "MEDIUM" | "SLOW";

export interface KeyResult {
  label: string;
  value: string;
}

export interface RelatedLink {
  slug: string;
  type: RelationType;
  /** "왜 이 글을 다음에 읽어야 하는지" 한 문장 (필수) */
  reason: string;
}

export interface VersionEntry {
  date: string;
  type: VersionType;
  note: string;
  verdictFrom?: Verdict;
  verdictTo?: Verdict;
}

export interface TrackInfo {
  days: number;
  startedAt?: string | null;
  nextUpdateAt?: string | null;
}

export interface ClaimInfo {
  text: string;
  source: string;
  sourceUrl?: string;
  checkedAt?: string;
}

export interface ArticleMeta {
  id: string;
  slug: string;
  title: string;
  summary: string;
  task: string;
  format: Format;
  verificationMethod?: VerificationMethod | null;
  verdict?: Verdict | null;
  effects: Effect[];
  keyResults: KeyResult[];
  tools: string[];
  conditions?: string | null;
  checkedAt?: string | null;
  publishedAt?: string | null;
  updatedAt?: string | null;
  freshness: Freshness;
  status: Status;
  nextCheckAt?: string | null;
  disclosure: Disclosure;
  aiUse?: string | null;
  fitFor: string[];
  notFor: string[];
  nextQuestions: string[];
  related: RelatedLink[];
  versions: VersionEntry[];
  track?: TrackInfo | null;
  claim?: ClaimInfo | null;
  /** true면 구조 확인용 예시. 화면에 SAMPLE로 표시되고 확인 기록 집계에서 빠진다. */
  sample: boolean;
}

export interface Article extends ArticleMeta {
  html: string;
}

export interface Task {
  slug: string;
  name: string;
  group: TaskGroup;
  order: number;
  description: string;
  /** 먼저 볼 글 (운영자가 고름) */
  featured: string[];
  /** 아직 해보지 않은 것 */
  nextChecks: string[];
  /** 임시 통합 허브 등 안내 */
  note?: string | null;
}

export interface WeeklyItem {
  text: string;
  slug?: string;
}

export interface WeeklyIssue {
  slug: string;
  issue: number;
  date: string;
  title: string;
  sample: boolean;
  changes: WeeklyItem[];
  checked: WeeklyItem[];
  tryThis?: WeeklyItem | null;
  tracking: WeeklyItem[];
  updates: WeeklyItem[];
  html: string;
}

export interface Correction {
  date: string;
  slug: string;
  what: string;
  fix: string;
}
