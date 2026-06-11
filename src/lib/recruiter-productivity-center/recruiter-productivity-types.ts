export type RecruiterAgingBucketId = "0-2" | "3-7" | "8-14" | "15+";

export type RecruiterAgingBucket = {
  id: RecruiterAgingBucketId;
  label: string;
  count: number;
};

export type RecruiterDashboardKpis = {
  applicantsAssigned: number;
  newApplicantsToday: number;
  followUpsDue: number;
  paperworkPending: number;
  readyForMel: number;
  hiredThisWeek: number;
};

export type RecruiterScorecardRow = {
  recruiter: string;
  contactRatePercent: number | null;
  paperworkConversionPercent: number | null;
  hireConversionPercent: number | null;
  avgTimeToFirstContactHours: number | null;
  avgDaysToHire: number | null;
  assignedCount: number;
};

export type RecruiterDailyTaskType =
  | "call-candidate"
  | "send-paperwork"
  | "follow-up"
  | "escalate-dm";

export type RecruiterDailyTask = {
  id: string;
  type: RecruiterDailyTaskType;
  label: string;
  candidateId: string;
  candidateName: string;
  city: string;
  state: string;
  recruiter: string;
  priorityScore: number;
  detail: string;
};

export type RecruiterProductivityFilters = {
  actingRecruiter?: string | null;
  territoryStates?: string[] | null;
};

export type RecruiterProductivitySnapshot = {
  fetchedAt: string;
  filters: RecruiterProductivityFilters;
  dashboard: RecruiterDashboardKpis;
  scorecards: RecruiterScorecardRow[];
  agingBuckets: RecruiterAgingBucket[];
  dailyTasks: RecruiterDailyTask[];
  /** Composite 0–100 for executive rollup. */
  productivityScore: number;
};
