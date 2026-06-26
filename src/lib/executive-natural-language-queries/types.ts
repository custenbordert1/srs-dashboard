export const P69_SOURCE_PHASE = "P69";
export const P69_PREVIEW_MODE = true as const;

export type ExecutiveQueryCategory = "applicants" | "paperwork" | "brief" | "communication" | "orchestrator";

export type ExecutiveQueryId =
  | "applicants_today"
  | "applicants_week"
  | "applicants_month"
  | "paperwork_sent_today"
  | "paperwork_sent_week"
  | "paperwork_signed_today"
  | "paperwork_auto_sent_today"
  | "paperwork_manual_sent_today"
  | "paperwork_failed_count"
  | "paperwork_waiting_longest"
  | "paperwork_top_recruiter_today"
  | "paperwork_ready_for_auto"
  | "paperwork_waiting_signature"
  | "paperwork_blocked_auto"
  | "paperwork_oldest_pending"
  | "paperwork_failed_today"
  | "brief_how_are_we_doing"
  | "brief_recruiting_summary"
  | "brief_what_changed"
  | "brief_needs_attention"
  | "communication_sent_today"
  | "communication_needs_reminders"
  | "communication_no_response"
  | "communication_failures"
  | "communication_welcome_today"
  | "communication_waiting_approval"
  | "orchestrator_system_status"
  | "orchestrator_automation_blocked"
  | "orchestrator_engine_waiting"
  | "orchestrator_candidates_stuck"
  | "orchestrator_today_workflow"
  | "orchestrator_hiring_blockers"
  | "orchestrator_next_actions"
  | "orchestrator_recruiter_automated"
  | "orchestrator_workflow_attention";

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
