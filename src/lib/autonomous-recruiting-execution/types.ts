import type { AutopilotExecution } from "@/lib/autonomous-recruiting-execution/execution-store";
import type { AutopilotRecruiterTask } from "@/lib/autonomous-recruiting-execution/recruiter-task-store";

export type ExecutionStatus =
  | "detected"
  | "recommended"
  | "approved"
  | "executing"
  | "completed"
  | "failed"
  | "archived";

export type RecommendationType = "posting" | "hiring" | "coverage" | "refresh";

export type ExecutionAuditEntry = {
  id: string;
  at: string;
  action: string;
  actor?: string;
  detail: string;
};

export type ExecutionPayload = {
  title?: string;
  candidateId?: string;
  candidateName?: string;
  adType?: "create-new-ad" | "close-pause-ad" | "refresh-ad";
  city?: string;
  state?: string;
  breezyJobId?: string;
  positionId?: string;
  reason?: string;
  refreshCount?: number;
  hiringAction?: string;
  coverageStatus?: string;
};

export type ExecutionOutcome = {
  summary: string;
  success: boolean;
  linkedResourceType?: "job-draft" | "automation-run";
  linkedResourceId?: string;
};

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

export type ExecutionAuditLogEntry = ExecutionAuditEntry & {
  executionId: string;
  territory: string;
  type: RecommendationType;
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
  executionQueue: AutopilotExecution[];
  postingAutomation: PostingAutomationRow[];
  recruiterTaskQueue: AutopilotRecruiterTask[];
  applicantPerformance: ApplicantPerformanceRow[];
  auditLog: ExecutionAuditLogEntry[];
  outcomes: ExecutionOutcomeMetric[];
};

export type { AutopilotExecution, AutopilotRecruiterTask };
