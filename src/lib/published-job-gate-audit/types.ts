export const P93_SOURCE_PHASE = "P93";
export const P93_PREVIEW_MODE = true as const;

export type PublishedJobGateBlocker =
  | "missing_recruiter_assignment"
  | "missing_dm_assignment"
  | "candidate_still_in_applied"
  | "p83_did_not_advance"
  | "wrong_position_mapping"
  | "duplicate_candidate"
  | "paperwork_already_sent"
  | "invalid_email"
  | "terminal_status"
  | "p84_rule_mismatch"
  | "data_stale_cache_issue"
  | "p84_eligible_now";

export const PUBLISHED_JOB_GATE_BLOCKER_LABELS: Record<PublishedJobGateBlocker, string> = {
  missing_recruiter_assignment: "Missing Recruiter Assignment",
  missing_dm_assignment: "Missing DM Assignment",
  candidate_still_in_applied: "Candidate Still in Applied Stage",
  p83_did_not_advance: "P83 Did Not Advance",
  wrong_position_mapping: "Wrong Position Mapping",
  duplicate_candidate: "Duplicate Candidate",
  paperwork_already_sent: "Paperwork Already Sent",
  invalid_email: "Invalid Email",
  terminal_status: "Terminal Status",
  p84_rule_mismatch: "P84 Rule Mismatch",
  data_stale_cache_issue: "Data Stale/Cache Issue",
  p84_eligible_now: "P84 Eligible Now",
};

export type PublishedJobGateTrace = {
  candidateId: string;
  candidateName: string;
  positionId: string;
  jobTitle: string;
  breezyPositionMapping: {
    positionId: string;
    jobInPublishedList: boolean;
    jobInLiveFetch: boolean;
    liveBreezyStatus: string;
    positionNameMatch: boolean;
  };
  candidateToPosition: {
    candidatePositionId: string;
    auditedJobPositionId: string;
    matches: boolean;
  };
  dmTerritory: string;
  suggestedDm: string;
  assignedDm: string;
  dmNeedsAssignment: boolean;
  recruiter: {
    assigned: string;
    recommended: string;
    assignmentConfidence: number | null;
    missing: boolean;
  };
  p83: {
    action: string;
    shouldAdvance: boolean;
    shouldPersist: boolean;
    reason: string;
  };
  workflowStatus: string;
  actionType: string;
  breezyStage: string;
  stageMapping: {
    breezyStage: string;
    localWorkflowStatus: string;
    expectedAfterP83: string;
    aligned: boolean;
  };
  p84: {
    eligible: boolean;
    blockingReasons: string[];
    failedGateIds: string[];
  };
  primaryBlocker: PublishedJobGateBlocker;
  primaryBlockerLabel: string;
  blockerReason: string;
  fixableWithoutBreezyJobAction: boolean;
  shouldRemainBlocked: boolean;
};

export type PublishedJobAuditEntry = {
  positionId: string;
  jobTitle: string;
  city: string;
  state: string;
  liveBreezyStatus: string;
  candidateCount: number;
  traces: PublishedJobGateTrace[];
};

export type PublishedJobGateAuditMetrics = {
  totalPublishedJobsAudited: number;
  candidatesTiedToPublishedJobs: number;
  candidatesP84EligibleNow: number;
  candidatesBlockedByP62: number;
  candidatesBlockedByP83: number;
  candidatesBlockedByP84: number;
  candidatesAlreadyPaperworkSent: number;
  candidatesFixableWithoutBreezyJobAction: number;
  candidatesShouldRemainBlocked: number;
  primaryBlockerCounts: Record<PublishedJobGateBlocker, number>;
};

export type PublishedJobGateAuditReport = {
  sourcePhase: typeof P93_SOURCE_PHASE;
  previewMode: typeof P93_PREVIEW_MODE;
  generatedAt: string;
  mtdRangeLabel: string;
  sectionTitle: "Published Job Downstream Gate Audit";
  metrics: PublishedJobGateAuditMetrics;
  publishedJobs: PublishedJobAuditEntry[];
  exampleTraces: PublishedJobGateTrace[];
  nextOperationalFix: string[];
  remainingBlockersBeforeP84Unlock: string[];
};
