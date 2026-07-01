export const P115_SOURCE_PHASE = "P115";
export const P115_DEFAULT_MODE = "dryRun" as const;

export type ReviewFirstRecommendedAction =
  | "approve_individually"
  | "reject_group"
  | "split_group"
  | "request_recruiter_review";

export type SplitDimension =
  | "city"
  | "state"
  | "position_title"
  | "client_project"
  | "confidence_score";

export type MissingConfidenceFactor = {
  factor: string;
  detail: string;
  affectedCandidates: number;
  maxPointsAvailable: number;
};

export type SplitRecommendation = {
  splitBy: SplitDimension;
  subgroupLabel: string;
  candidateCount: number;
  candidateIds: string[];
  averageConfidence: number;
  wouldBecomeSafe: boolean;
  projectedSafeToApprove: "SAFE" | "REVIEW FIRST" | "DO NOT APPROVE";
  reason: string;
};

export type ReviewFirstGroupBreakdown = {
  groupId: string;
  groupName: string;
  closedPositionTitle: string;
  candidateCount: number;
  averageConfidence: number;
  minConfidence: number;
  confidenceBand: string;
  recommendedActivePosition: {
    positionId: string | null;
    title: string | null;
    city: string;
    state: string;
  };
  missingConfidenceFactors: MissingConfidenceFactor[];
  riskReason: string;
  riskNotes: string[];
  whyNotSafe: string;
  whatWouldMakeItSafe: string[];
  recommendedAction: ReviewFirstRecommendedAction;
  recommendedActionReason: string;
  splitRecommendations: SplitRecommendation[];
  candidateIds: string[];
};

export type ReviewFirstRiskBreakdownReport = {
  sourcePhase: typeof P115_SOURCE_PHASE;
  generatedAt: string;
  mode: typeof P115_DEFAULT_MODE;
  summary: string;
  bulkApprovalGoNoGo: "GO" | "NO-GO";
  bulkApprovalGoNoGoReason: string;
  metrics: {
    remainingReviewFirstGroups: number;
    candidatesAffected: number;
    splitRecommendationsCount: number;
    splittableSafeSubgroups: number;
    approveIndividuallyCount: number;
    splitGroupCount: number;
    requestRecruiterReviewCount: number;
    rejectGroupCount: number;
  };
  safestNextGroup: {
    groupId: string;
    groupName: string;
    action: ReviewFirstRecommendedAction;
    splitBy: SplitDimension | null;
    candidateCount: number;
    averageConfidence: number;
    reason: string;
  } | null;
  groups: ReviewFirstGroupBreakdown[];
  safetyStatus: {
    analysisOnly: boolean;
    noApprovalsPersisted: boolean;
    noBreezyWrites: boolean;
    noLiveSends: boolean;
    noLiveMode: boolean;
    p1063RunnerUnchanged: boolean;
    liveRunnerUnwired: boolean;
  };
  warnings: string[];
};
