export type RecruiterTodayBucket = "must-do" | "should-do" | "monitor";

export type RecruiterTodayItemId =
  | "overdue-follow-ups"
  | "paperwork-stale"
  | "interviews-needed"
  | "mel-ready"
  | "new-applicants"
  | "unassigned"
  | "follow-ups-tomorrow"
  | "aging-candidates"
  | "stalled-stages"
  | "strong-applicants";

export type RecruiterTodayItem = {
  id: RecruiterTodayItemId;
  bucket: RecruiterTodayBucket;
  label: string;
  count: number;
  candidateIds: string[];
  href: string;
};

export type RecruiterPipelineStageId =
  | "applied"
  | "needs-review"
  | "interview"
  | "paperwork"
  | "ready-for-mel"
  | "hired";

export type RecruiterPipelineCard = {
  id: RecruiterPipelineStageId;
  label: string;
  count: number;
  trend7d: number;
  agingWarning: boolean;
  href: string;
};

export type RecruiterProductivityPeriod = "today" | "week" | "month";

export type RecruiterProductivitySnapshot = {
  candidatesContacted: number;
  interviewsScheduled: number;
  paperworkSent: number;
  paperworkCompleted: number;
  readyForMel: number;
  hires: number;
};

export type RecruiterProductivityByPeriod = Record<
  RecruiterProductivityPeriod,
  RecruiterProductivitySnapshot
>;

export type RecruiterScorecard = {
  recruiter: string;
  candidatesOwned: number;
  tasksCompleted: number;
  responseTimeHours: number | null;
  stagesMoved: number;
  readyForMel: number;
};

export type RecruiterDailyPlanAction = {
  id: string;
  label: string;
  candidateId: string;
  href: string;
  priority: number;
};

export type RecruiterHiringForecast = {
  readyForMel7d: number;
  readyForMel30d: number;
  expectedHires30d: number;
  paperworkBottleneckCount: number;
  interviewBottleneckCount: number;
  assumptions: string;
};

export type RecruiterDashboardSnapshot = {
  actingRecruiter: string;
  generatedAt: string;
  today: RecruiterTodayItem[];
  pipeline: RecruiterPipelineCard[];
  productivity: RecruiterProductivityByPeriod;
  forecast: RecruiterHiringForecast;
  scorecard: RecruiterScorecard;
  dailyPlan: RecruiterDailyPlanAction[];
  autoTasks: import("@/lib/hiring-funnel-automation/types").RecruiterTask[];
  workloadRecommendations: import("@/lib/hiring-funnel-automation/types").WorkloadBalanceRecommendation[];
  funnelRiskSummary: { critical: number; warning: number; healthy: number };
};
