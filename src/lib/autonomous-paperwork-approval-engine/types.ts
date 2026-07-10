export const P124_SOURCE_PHASE = "P124";

export type ApprovalDecision =
  | "AUTO_APPROVED"
  | "NEEDS_HUMAN_APPROVAL"
  | "BLOCKED"
  | "WAITING"
  | "REJECTED_FOR_SAFETY";

export type ApprovalPolicy = {
  readonly: true;
  autoApproveThreshold: number;
  humanApprovalThreshold: number;
  waitingThreshold: number;
  requirePublishedJob: boolean;
  requireValidEmail: boolean;
  requireNoDuplicateRisk: boolean;
  requireNoAlreadySent: boolean;
  requireTemplate: boolean;
  requireApprovedMappingOrNativeProject: boolean;
};

export type CriticalSafetyFailure =
  | "already_sent"
  | "duplicate_risk"
  | "invalid_email"
  | "missing_template"
  | "missing_candidate_email"
  | "rejected_mapping"
  | "manual_rejection";

export type CandidateApprovalRecord = {
  candidateId: string;
  candidateName: string;
  email: string;
  approvalDecision: ApprovalDecision;
  approvalScore: number;
  approvalReasons: string[];
  safetyReasons: string[];
  humanReviewReasons: string[];
  blockingReasons: string[];
  recommendedNextAction: string;
  explanation: string;
};

export type ApprovalSummary = {
  autoApproved: number;
  needsHumanApproval: number;
  blocked: number;
  waiting: number;
  rejectedForSafety: number;
  averageApprovalScore: number;
  topBlockers: Array<{ reason: string; count: number }>;
  highestConfidenceReady: CandidateApprovalRecord[];
};

export type ApprovalReport = {
  sourcePhase: typeof P124_SOURCE_PHASE;
  generatedAt: string;
  policy: ApprovalPolicy;
  summary: ApprovalSummary;
  decisions: CandidateApprovalRecord[];
  autoApproved: CandidateApprovalRecord[];
  humanReview: CandidateApprovalRecord[];
  blocked: CandidateApprovalRecord[];
  safetyRejected: CandidateApprovalRecord[];
  topCandidates: CandidateApprovalRecord[];
  blockers: Array<{ reason: string; count: number }>;
  goNoGo: "GO" | "NO-GO";
  goNoGoReason: string;
};
