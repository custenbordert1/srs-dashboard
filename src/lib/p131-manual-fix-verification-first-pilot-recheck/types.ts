export const P131_SOURCE_PHASE = "P131";
export const P131_VERIFICATION_MODE = "previewOnly" as const;
export const P131_TARGET_CANDIDATE_ID = "92fa58cc5870";
export const P131_TARGET_CANDIDATE_NAME = "Tyree nicole Gilley";
export const P131_RECOMMENDED_JOB_ID = "93ebc05539b8";

export type VerificationCheck = {
  id: string;
  label: string;
  passed: boolean;
  expected: string;
  actual: string;
};

export type ManualFixVerificationReport = {
  sourcePhase: typeof P131_SOURCE_PHASE;
  generatedAt: string;
  mode: typeof P131_VERIFICATION_MODE;
  targetCandidateId: typeof P131_TARGET_CANDIDATE_ID;
  targetCandidateName: typeof P131_TARGET_CANDIDATE_NAME;
  recommendedJobId: typeof P131_RECOMMENDED_JOB_ID;
  verification: {
    checks: VerificationCheck[];
    allPassed: boolean;
    passedCount: number;
    failedCount: number;
  };
  p124Approval: {
    approvalDecision: string;
    approvalScore: number;
    autoApproved: boolean;
    humanReviewReasons: string[];
    blockingReasons: string[];
    safetyReasons: string[];
  };
  p123Orchestrator: {
    approvedForQueue: boolean;
    approvalRequired: boolean;
    onPilotAllowlist: boolean;
    reason: string;
  };
  p128PilotSelection: {
    selectedCandidateId: string;
    selectedCandidateName: string;
    matchesTarget: boolean;
    approvalDecision: string;
    approvalScore: number;
    eligibilityStatus: string;
    confirmations: {
      validEmail: boolean;
      noDuplicateRisk: boolean;
      noAlreadySent: boolean;
      publishedJobOrApprovedMapping: boolean;
      templateAvailable: boolean;
    };
    goNoGo: string;
    goNoGoReason: string;
  };
  p122PilotReadiness: {
    status: string;
    readyToSend: boolean;
    mappingSource: string;
    templateKey: string | null;
    safetyChecks: Array<{ id: string; label: string; passed: boolean; detail: string }>;
    candidateSafetyPassed: boolean;
    systemSafetyPassed: boolean;
    blockingReasons: string[];
  };
  autoApproved: boolean;
  approvalScore: number;
  finalAllowlistCommand: string;
  finalLiveCommandPreview: string;
  exactEnvVarsNeeded: Record<string, string>;
  goNoGo: "GO" | "GO WITH CONDITIONS" | "NO-GO";
  goNoGoReason: string;
  executeBatchCalled: false;
  breezyWrites: false;
  liveModeEnabled: boolean;
  paperworkSent: false;
  thresholdChanged: false;
};
