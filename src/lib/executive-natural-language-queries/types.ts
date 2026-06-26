export const P69_SOURCE_PHASE = "P69";
export const P69_PREVIEW_MODE = true as const;

export type ExecutiveQueryCategory = "applicants" | "paperwork";

export type ExecutiveQueryId =
  | "applicants_today"
  | "applicants_week"
  | "applicants_month"
  | "paperwork_sent_today"
  | "paperwork_sent_week"
  | "paperwork_signed_today";

export type SupportedExecutiveQuery = {
  id: ExecutiveQueryId;
  category: ExecutiveQueryCategory;
  question: string;
  examplePhrases: string[];
  /** Future queries register here without changing resolver core */
  previewOnly: true;
};

export type ExecutiveQueryComparison = {
  label: string;
  value: number;
  delta: number;
  direction: "up" | "down" | "flat";
  deltaLabel: string;
};

export type ExecutiveQueryAnswer = {
  queryId: ExecutiveQueryId;
  question: string;
  category: ExecutiveQueryCategory;
  previewMode: true;
  sourceSystem: string;
  lastRefreshedAt: string;
  total: number;
  metrics: Record<string, number>;
  comparison: ExecutiveQueryComparison | null;
  summary: string;
};

export type ExecutiveQueryCardId = "applicants_today" | "paperwork_today";

export type ExecutiveQueryCard = {
  id: ExecutiveQueryCardId;
  title: string;
  previewMode: true;
  sourceSystem: string;
  lastRefreshedAt: string;
  lastRefreshedLabel: string;
  primaryValue: number;
  primaryLabel: string;
  comparison: ExecutiveQueryComparison | null;
  lines: Array<{ label: string; value: number | string }>;
};

export type ExecutiveQueryDashboardSnapshot = {
  previewMode: true;
  sourcePhase: typeof P69_SOURCE_PHASE;
  fetchedAt: string;
  cards: ExecutiveQueryCard[];
  supportedQuestions: SupportedExecutiveQuery[];
  recentAnswers: ExecutiveQueryAnswer[];
};

export type ExecutiveQueryPreviewResult = {
  ok: true;
  previewMode: typeof P69_PREVIEW_MODE;
  fetchedAt: string;
  dashboard: ExecutiveQueryDashboardSnapshot;
  answer: ExecutiveQueryAnswer | null;
  warnings: string[];
};
