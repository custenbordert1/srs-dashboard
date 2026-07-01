import type { ReviewWorkflowItem } from "@/lib/p109-project-mapping-review/types";
import type { P109ReviewDecision } from "@/lib/p109-project-mapping-review/types";

export const P111_SOURCE_PHASE = "P111";
export const P111_BULK_APPROVE_MIN_CONFIDENCE = 65;

export type ConfidenceBand = "high_80_plus" | "approvable_65_79" | "review_50_64" | "low_below_50";

export type BulkReviewGroup = {
  groupId: string;
  closedPositionTitle: string;
  closedPositionId: string;
  recommendedPositionId: string | null;
  recommendedPositionTitle: string | null;
  city: string;
  state: string;
  confidenceBand: ConfidenceBand;
  client: string | null;
  averageConfidence: number;
  minConfidence: number;
  candidateCount: number;
  candidateIds: string[];
  members: ReviewWorkflowItem[];
  bulkApprovable: boolean;
  bulkApproveBlockers: string[];
  individualReviewOnly: boolean;
};

export type CandidateSafetyCheck = {
  candidateId: string;
  candidateName: string;
  confidenceScore: number;
  passesBulkApprove: boolean;
  blockers: string[];
  baselineBlocker: string;
};

export type BulkImpactPreview = {
  groupId: string;
  action: P109ReviewDecision;
  sharedNote: string;
  candidatesAffected: number;
  newlyEligibleAfterApproval: number;
  safetyExcluded: {
    alreadySent: number;
    duplicateRisk: number;
    invalidEmail: number;
    other: number;
  };
  remainingPending: number;
  candidateDetails: Array<{
    candidateId: string;
    candidateName: string;
    wouldBecomeEligible: boolean;
    exclusionReason: string | null;
  }>;
};

export type BulkReviewToolsReport = {
  sourcePhase: typeof P111_SOURCE_PHASE;
  generatedAt: string;
  mode: "dryRun";
  summary: string;
  metrics: {
    totalGroups: number;
    bulkApprovableGroups: number;
    individualReviewOnlyGroups: number;
    totalPendingCandidates: number;
    bulkApprovableCandidates: number;
    estimatedCandidatesRecoverable: number;
    safetyExclusions: {
      alreadySent: number;
      duplicateRisk: number;
      invalidEmail: number;
      belowConfidenceThreshold: number;
      missingRecommendedPosition: number;
    };
  };
  groups: BulkReviewGroup[];
  topRecommendedBulkApprovals: BulkReviewGroup[];
  warnings: string[];
};
