export const P95_SOURCE_PHASE = "P95";
export const P95_PREVIEW_MODE = true as const;

export const P95_EXCLUDED_CALL_FIRST_CANDIDATE_ID = "3fbb949f2be4";
export const P95_EXCLUDED_CALL_FIRST_CANDIDATE_NAME = "Kerri Haynes";

export type ApprovalQueueStatus = "pending" | "simulated_approved";

export type ApprovalExclusionReason =
  | "call_first_technology_gap"
  | "p94_simulation_failed"
  | "not_assignable"
  | "monitor_only"
  | "closed_job_cohort";

export type ApprovalRiskLevel = "low" | "medium" | "high";

export type PostApprovalSimulation = {
  approvalSimulated: true;
  workflowStatus: "Paperwork Needed";
  actionType: "send-paperwork";
  recruiterAssigned: string;
  dmAssigned: string;
  p84Eligible: true;
  liveSend: false;
  p83Action: string;
  simulationDetail: string;
};

export type P62P83ApprovalQueueEntry = {
  candidateId: string;
  candidateName: string;
  positionId: string;
  jobTitle: string;
  city: string;
  state: string;
  dmTerritory: string;
  suggestedDm: string;
  assignedRecruiter: string;
  confidence: number;
  approvalStatus: ApprovalQueueStatus;
  riskLevel: ApprovalRiskLevel;
  safeToApprove: true;
  assignmentReason: string;
  postApprovalSimulation: PostApprovalSimulation;
  manualApprovalRequired: true;
  autoApproveBlocked: true;
};

export type P62P83ExcludedEntry = {
  candidateId: string;
  candidateName: string;
  exclusionReason: ApprovalExclusionReason;
  exclusionLabel: string;
  detail: string;
};

export type P62P83ApprovalPreviewMetrics = {
  approvalQueueCount: number;
  safeToApprove: number;
  excludedCallFirst: number;
  expectedPaperworkNeeded: number;
  expectedP84Eligible: number;
  liveSendsBlocked: number;
  excludedTotal: number;
};

export type P62P83ApprovalPreviewReport = {
  sourcePhase: typeof P95_SOURCE_PHASE;
  previewMode: typeof P95_PREVIEW_MODE;
  generatedAt: string;
  mtdRangeLabel: string;
  sectionTitle: "P62/P83 Approval Preview";
  cohortLabel: string;
  metrics: P62P83ApprovalPreviewMetrics;
  approvalQueue: P62P83ApprovalQueueEntry[];
  excluded: P62P83ExcludedEntry[];
  sampleApprovalTraces: P62P83ApprovalQueueEntry[];
  remainingBlockersBeforeLivePaperwork: string[];
};
