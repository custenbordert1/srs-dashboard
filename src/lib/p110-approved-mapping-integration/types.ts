import type { P109ReviewDecisionRecord } from "@/lib/p109-project-mapping-review/types";

export const P110_SOURCE_PHASE = "P110";
export const P110_DEFAULT_MODE = "dryRun" as const;

export type ApprovedMappingResolution = {
  qualifies: boolean;
  candidateId: string;
  closedPositionId: string;
  recommendedPositionId: string;
  recommendedPositionTitle: string | null;
  confidenceScore: number;
  reviewer: string;
  timestamp: string;
  mappingReasons: string[];
  reason: string;
};

export type DryRunEligibilityOutcome =
  | "newly_eligible_via_approval"
  | "still_blocked"
  | "already_eligible_baseline"
  | "excluded_already_sent"
  | "excluded_duplicate_risk"
  | "excluded_invalid_email"
  | "needs_recruiter_review"
  | "not_approved";

export type CandidateDryRunResult = {
  candidateId: string;
  candidateName: string;
  closedPositionId: string | null;
  baselineBlocker: string;
  overlayBlocker: string | null;
  outcome: DryRunEligibilityOutcome;
  approvedMapping: ApprovedMappingResolution | null;
};

export type IntegrationDryRunReport = {
  sourcePhase: typeof P110_SOURCE_PHASE;
  generatedAt: string;
  mode: typeof P110_DEFAULT_MODE;
  summary: string;
  goNoGo: "GO" | "NO-GO";
  goNoGoReason: string;
  metrics: {
    approvedMappingsCount: number;
    newlyEligibleViaApproval: number;
    blockedCount: number;
    reviewCount: number;
    alreadyEligibleBaseline: number;
    safetyExclusions: {
      alreadySent: number;
      duplicateRisk: number;
      invalidEmail: number;
    };
    pendingApprovals: number;
    rejectedApprovals: number;
    skippedApprovals: number;
    notApproved: number;
  };
  sampleCandidates: {
    newlyEligible: CandidateDryRunResult[];
    stillBlocked: CandidateDryRunResult[];
    safetyExcluded: CandidateDryRunResult[];
    needsReview: CandidateDryRunResult[];
  };
  safetyStatus: {
    p1063RunnerUnchanged: boolean;
    noBreezyWrites: boolean;
    noLiveSends: boolean;
    noLiveMode: boolean;
    protectionOrderPreserved: boolean;
    dryRunOnly: boolean;
  };
  warnings: string[];
};
