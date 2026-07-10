export const P113_SOURCE_PHASE = "P113";
export const P113_DEFAULT_MODE = "dryRun" as const;
export const P113_REVIEWER = "Taylor";
export const P113_APPROVAL_NOTES = "Approved via P113 first safe bulk approval dry run";

/** P112 first SAFE bulk-approvable group (Continuity Store Merchandiser – Payson, AZ). */
export const P113_TARGET_GROUP_ID =
  "continuity store merchandiser - payson, az::07c1de432ea6::payson::AZ::high_80_plus::store";

export const P113_TARGET_RECOMMENDED_POSITION_ID = "07c1de432ea6";

export type FirstSafeBulkApprovalReport = {
  sourcePhase: typeof P113_SOURCE_PHASE;
  generatedAt: string;
  mode: typeof P113_DEFAULT_MODE;
  summary: string;
  goNoGo: "GO" | "NO-GO";
  goNoGoReason: string;
  approvedGroup: {
    groupId: string;
    groupName: string;
    closedPositionTitle: string;
    candidateCount: number;
    averageConfidence: number;
    safeToApprove: "SAFE";
    recommendedPositionId: string | null;
    recommendedPositionTitle: string | null;
  };
  approvedCandidates: Array<{
    candidateId: string;
    candidateName: string;
    closedPositionId: string;
    recommendedPositionId: string | null;
    decision: "approved";
    reviewer: string;
    notes: string;
    timestamp: string;
    confidenceScore: number;
    mappingReasons: string[];
    alreadyApproved: boolean;
  }>;
  integrationAfterApproval: {
    newlyEligibleViaApproval: number;
    newlyEligibleCandidateIds: string[];
    safetyExclusions: {
      alreadySent: number;
      duplicateRisk: number;
      invalidEmail: number;
    };
    remainingPending: number;
    approvedMappingsCount: number;
  };
  safetyStatus: {
    p1063RunnerUnchanged: boolean;
    noBreezyWrites: boolean;
    noLiveSends: boolean;
    noLiveMode: boolean;
    dryRunOnly: boolean;
    localApprovalOnly: boolean;
    liveRunnerUnwired: boolean;
  };
  warnings: string[];
};
