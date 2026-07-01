import type {
  CandidateMappingRecommendation,
  MappingDecision,
  MappingFactorScore,
  MappingReviewAction,
} from "@/lib/p108-intelligent-project-mapping/types";

export const P109_SOURCE_PHASE = "P109";
export const P109_DEFAULT_MODE = "dryRun" as const;

export type P109ReviewDecision = "approved" | "rejected" | "skipped";

export type MappingApprovalStatus = "approved" | "rejected" | "skipped" | "pending";

export type P109ReviewDecisionRecord = {
  candidateId: string;
  candidateName: string;
  closedPositionId: string;
  recommendedPositionId: string | null;
  decision: P109ReviewDecision;
  reviewer: string;
  notes: string;
  timestamp: string;
  confidenceScore: number;
  mappingReasons: string[];
  mappingDecision: MappingDecision;
  factorScores: MappingFactorScore[];
};

export type ReviewWorkflowItem = {
  candidateId: string;
  candidateName: string;
  closedPosition: CandidateMappingRecommendation["currentClosedPosition"];
  recommendedPosition: {
    positionId: string | null;
    title: string | null;
    city: string | null;
    state: string | null;
  };
  confidenceScore: number;
  mappingDecision: MappingDecision;
  mappingReasons: string[];
  factorScores: MappingFactorScore[];
  explanationHeadline: string;
  approvalStatus: MappingApprovalStatus;
  priorDecision: P109ReviewDecision | null;
  priorNotes: string | null;
  availableActions: MappingReviewAction[];
};

export type ReviewWorkflowSafetyStatus = {
  p1063RunnerUnchanged: boolean;
  noBreezyWrites: boolean;
  noLiveSends: boolean;
  noAutoPaperworkFromReview: boolean;
  unapprovedReviewBlocked: boolean;
  protectionOrderPreserved: boolean;
};

export type ReviewWorkflowReport = {
  sourcePhase: typeof P109_SOURCE_PHASE;
  generatedAt: string;
  mode: typeof P109_DEFAULT_MODE;
  summary: string;
  metrics: {
    totalReviewCandidates: number;
    approvedCount: number;
    rejectedCount: number;
    skippedCount: number;
    pendingCount: number;
    autoMapCount: number;
    noMatchCount: number;
  };
  topProjectsNeedingReview: Array<{
    positionId: string;
    title: string;
    city: string;
    state: string;
    pendingCount: number;
    totalCandidates: number;
    averageConfidence: number;
  }>;
  highestConfidencePending: ReviewWorkflowItem[];
  lowestConfidencePending: ReviewWorkflowItem[];
  reviewQueue: ReviewWorkflowItem[];
  approvalBridge: {
    approved: string[];
    rejected: string[];
    skipped: string[];
    pending: string[];
  };
  safetyStatus: ReviewWorkflowSafetyStatus;
  warnings: string[];
};
