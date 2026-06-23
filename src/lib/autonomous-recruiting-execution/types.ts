import type { ExecutionCorrelation } from "@/lib/autonomous-recruiting-execution/execution-correlation";
import type { RecruiterTaskView } from "@/lib/autonomous-recruiting-execution/build-recruiter-task-view";

export type ExecutionStatus =
  | "detected"
  | "recommended"
  | "approved"
  | "executing"
  | "completed"
  | "failed"
  | "archived";

export type RecommendationType = "posting" | "hiring" | "coverage" | "refresh";

export type ExecutionKpis = {
  recommendationsGenerated: number;
  approved: number;
  inProgress: number;
  completed: number;
  postingSuccessRate: number;
  applicantConversionRate: number;
  timeSaved: number;
  coverageRiskReduction: number;
  hoursSavedFormula: string;
};

export type ExecutionFunnelStep = {
  id: ExecutionStatus;
  label: string;
  count: number;
};

export type PostingAutomationRow = {
  executionId: string;
  title: string;
  territory: string;
  adType: string;
  status: ExecutionStatus;
  linkedJobDraftId?: string;
  linkedAutomationRunId?: string;
};

export type ApplicantPerformanceRow = {
  territoryKey: string;
  territoryLabel: string;
  applicants: number;
  qualified: number;
  interview: number;
  readyForMel: number;
  targetApplicants: number;
  timeToFillDays: number | null;
  alerts: string[];
};

export type ExecutionAuditLogEntry = {
  id: string;
  at: string;
  action: string;
  actor?: string;
  detail: string;
  executionId: string;
  territory: string;
  type: RecommendationType;
  source: "executive-accountability" | "hiring-automation-engine";
};

export type ExecutionOutcomeMetric = {
  id: string;
  label: string;
  value: number | string;
  unit?: string;
  detail?: string;
};

export type RecruitingExecutionSnapshot = {
  fetchedAt: string;
  kpis: ExecutionKpis;
  executionFunnel: ExecutionFunnelStep[];
  executionQueue: ExecutionCorrelation[];
  postingAutomation: PostingAutomationRow[];
  recruiterTaskQueue: RecruiterTaskView[];
  applicantPerformance: ApplicantPerformanceRow[];
  auditLog: ExecutionAuditLogEntry[];
  outcomes: ExecutionOutcomeMetric[];
};

export type { ExecutionCorrelation, RecruiterTaskView };
