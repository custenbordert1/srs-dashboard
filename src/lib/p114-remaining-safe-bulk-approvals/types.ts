export const P114_SOURCE_PHASE = "P114";
export const P114_DEFAULT_MODE = "dryRun" as const;
export const P114_REVIEWER = "Taylor";
export const P114_APPROVAL_NOTES = "Approved via P114 remaining safe bulk approval dry run";

export type RemainingSafeBulkApprovalsReport = {
  sourcePhase: typeof P114_SOURCE_PHASE;
  generatedAt: string;
  mode: typeof P114_DEFAULT_MODE;
  summary: string;
  goNoGo: "GO" | "NO-GO";
  goNoGoReason: string;
  approvedGroups: Array<{
    groupId: string;
    groupName: string;
    closedPositionTitle: string;
    candidateCount: number;
    averageConfidence: number;
    safeToApprove: "SAFE";
    recommendedPositionId: string | null;
    recommendedPositionTitle: string | null;
    newlyWritten: number;
    alreadyApproved: number;
  }>;
  approvedCandidates: Array<{
    candidateId: string;
    candidateName: string;
    groupId: string;
    closedPositionId: string;
    recommendedPositionId: string | null;
    decision: "approved";
    reviewer: string;
    notes: string;
    timestamp: string;
    confidenceScore: number;
    mappingReasons: string[];
    newlyWritten: boolean;
  }>;
  metrics: {
    totalApprovedMappings: number;
    newlyEligibleViaApproval: number;
    newlyEligibleCandidateIds: string[];
    remainingPending: number;
    safetyExclusions: {
      alreadySent: number;
      duplicateRisk: number;
      invalidEmail: number;
    };
    safeGroupsIdentified: number;
    safeGroupsApplied: number;
    safeGroupsSkippedAlreadyApproved: number;
    excludedPaysonGroup: boolean;
    excludedReviewFirstGroups: number;
    excludedDoNotApproveGroups: number;
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
