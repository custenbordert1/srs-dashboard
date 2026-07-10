import type { BulkReviewGroup } from "@/lib/p111-bulk-mapping-review/types";

export const P112_SOURCE_PHASE = "P112";
export const P112_DEFAULT_MODE = "dryRun" as const;

export type ApprovalSafetyRecommendation = "SAFE" | "REVIEW FIRST" | "DO NOT APPROVE";

export type BulkGroupImpactSimulation = {
  groupId: string;
  groupName: string;
  closedPositionTitle: string;
  candidateCount: number;
  averageConfidence: number;
  minConfidence: number;
  confidenceBand: BulkReviewGroup["confidenceBand"];
  recommendedActivePosition: {
    positionId: string | null;
    title: string | null;
    city: string;
    state: string;
  };
  safetyExclusions: {
    alreadySent: number;
    duplicateRisk: number;
    invalidEmail: number;
    other: number;
    total: number;
  };
  newlyEligibleAfterApproval: number;
  remainingBlocked: number;
  recoveryRatePercent: number;
  safeToApprove: ApprovalSafetyRecommendation;
  riskNotes: string[];
  candidateIds: string[];
};

export type BulkApprovalImpactValidationReport = {
  sourcePhase: typeof P112_SOURCE_PHASE;
  generatedAt: string;
  mode: typeof P112_DEFAULT_MODE;
  summary: string;
  goNoGo: "GO" | "NO-GO";
  goNoGoReason: string;
  metrics: {
    totalBulkApprovableGroups: number;
    totalCandidates: number;
    estimatedNewlyEligible: number;
    totalRemainingBlocked: number;
    exclusions: {
      alreadySent: number;
      duplicateRisk: number;
      invalidEmail: number;
      other: number;
    };
    recommendations: {
      safe: number;
      reviewFirst: number;
      doNotApprove: number;
    };
  };
  recommendedFirstGroupToApprove: {
    groupId: string;
    groupName: string;
    candidateCount: number;
    newlyEligibleAfterApproval: number;
    safeToApprove: ApprovalSafetyRecommendation;
    reason: string;
  } | null;
  groupSimulations: BulkGroupImpactSimulation[];
  safetyStatus: {
    p1063RunnerUnchanged: boolean;
    noBreezyWrites: boolean;
    noLiveSends: boolean;
    noLiveMode: boolean;
    dryRunOnly: boolean;
    noActualApprovalsPersisted: boolean;
  };
  warnings: string[];
};
