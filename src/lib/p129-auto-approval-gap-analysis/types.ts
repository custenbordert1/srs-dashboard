export const P129_SOURCE_PHASE = "P129";
export const P129_ANALYSIS_MODE = "previewOnly" as const;

export type BlockerCategory =
  | "data_issue"
  | "policy_issue"
  | "mapping_issue"
  | "template_issue"
  | "safety_issue";

export type NearReadyCandidateGap = {
  candidateId: string;
  candidateName: string;
  email: string;
  approvalScore: number;
  currentDecision: string;
  scoreGapToAutoApprove: number;
  missingRequirements: string[];
  failedSafetyChecks: string[];
  humanReviewReasons: string[];
  exactBlockerPreventingAutoApproved: string;
  blockerCategory: BlockerCategory;
  mappingConfidence: number;
  nativePublishedJob: boolean;
  approvedMappingQualifies: boolean;
  eligibilityStatus: string;
  remediationSteps: string[];
};

export type AutoApprovalGapAnalysisReport = {
  sourcePhase: typeof P129_SOURCE_PHASE;
  generatedAt: string;
  mode: typeof P129_ANALYSIS_MODE;
  policy: import("@/lib/autonomous-paperwork-approval-engine/types").ApprovalPolicy;
  summary: {
    totalCandidatesEvaluated: number;
    autoApprovedCount: number;
    nearReadyCount: number;
    scoreThreshold: number;
  };
  nearReadyCandidates: NearReadyCandidateGap[];
  topBlockers: Array<{ reason: string; count: number; category: BlockerCategory }>;
  policyFindings: {
    isPolicyTooStrict: boolean;
    scoreOnlyBlockedCount: number;
    demotedDespiteHighScoreCount: number;
    wouldAutoApproveAtThreshold80: number;
    primaryPolicyFriction: string[];
    conclusion: string;
  };
  dataQualityFindings: {
    missingEmailCount: number;
    missingTemplateCount: number;
    missingQuestionnaireCount: number;
    unassignedRecruiterCount: number;
    primaryDataGaps: string[];
    conclusion: string;
  };
  safestPathToFirstAutoApproved: {
    candidateId: string | null;
    candidateName: string | null;
    currentScore: number | null;
    steps: string[];
    estimatedEffort: "low" | "medium" | "high";
  };
  goNoGo: "GO" | "GO WITH CONDITIONS" | "NO-GO";
  goNoGoReason: string;
  executeBatchCalled: false;
  breezyWrites: false;
  liveModeEnabled: boolean;
  paperworkSent: false;
};
