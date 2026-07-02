export const P133_SOURCE_PHASE = "P133";
export const P133_ANALYSIS_MODE = "previewOnly" as const;
export const P133_TARGET_CANDIDATE_ID = "92fa58cc5870";
export const P133_TARGET_CANDIDATE_NAME = "Tyree nicole Gilley";
export const P133_RECOMMENDED_JOB_ID = "93ebc05539b8";
export const P133_CLOSED_POSITION_ID = "7959fdf7c9f1";

export type FailedGate = {
  id: string;
  label: string;
  category: "resume" | "recruiter" | "mapping" | "job" | "approval" | "pilot" | "safety";
  passed: boolean;
  expected: string;
  actual: string;
  resolvedByP132: boolean;
};

export type RemainingFix = {
  id: string;
  title: string;
  priority: number;
  category: "manual_taylor" | "software_prepares_locally";
  currentValue: string;
  targetValue: string;
  pointsGained: number;
  manualSteps: string[];
  softwareSteps: string[];
};

export type AlternativePublishedJob = {
  jobId: string;
  name: string;
  city: string;
  state: string;
  status: string;
  matchScore: number;
  matchReasons: string[];
  isCurrentRecommended: boolean;
  shouldReplaceRecommended: boolean;
};

export type JobRemediationDecision = {
  recommendedJobId: string;
  recommendedJobTitle: string | null;
  recommendedJobPublished: boolean;
  currentPositionId: string | null;
  currentPositionClosed: boolean;
  p109Approved: boolean;
  p109Confidence: number;
  action: "reassign_to_recommended" | "keep_p109_overlay" | "remap_to_alternative";
  requiresPublish: boolean;
  requiresRemap: boolean;
  rationale: string;
};

export type TyreeRemainingPilotBlockersReport = {
  sourcePhase: typeof P133_SOURCE_PHASE;
  generatedAt: string;
  mode: typeof P133_ANALYSIS_MODE;
  targetCandidateId: typeof P133_TARGET_CANDIDATE_ID;
  targetCandidateName: typeof P133_TARGET_CANDIDATE_NAME;
  recommendedJobId: typeof P133_RECOMMENDED_JOB_ID;
  p132ResumeFix: {
    applied: boolean;
    hasResume: boolean;
    paperworkReady: boolean;
    resumeAssetsCount: number;
    detail: string;
  };
  currentScore: number;
  currentDecision: string;
  scoreGapToAutoApprove: number;
  failedGates: FailedGate[];
  passedGateCount: number;
  failedGateCount: number;
  remainingFixes: RemainingFix[];
  manualSteps: Array<{ order: number; fixId: string; step: string }>;
  softwareSteps: Array<{ order: number; step: string; command?: string }>;
  jobRemediation: JobRemediationDecision;
  alternativePublishedJobs: AlternativePublishedJob[];
  recruiterAssignment: {
    assigned: boolean;
    recruiter: string | null;
  };
  mappingConfidence: {
    current: number;
    required: number;
    p109Decision: string | null;
    approvedMappingQualifies: boolean;
  };
  p124Approval: {
    approvalDecision: string;
    approvalScore: number;
    autoApproved: boolean;
    humanReviewReasons: string[];
    blockingReasons: string[];
    safetyReasons: string[];
  };
  p122PilotReadiness: {
    status: string;
    readyToSend: boolean;
    mappingSource: string;
    blockingReasons: string[];
    candidateSafetyPassed: boolean;
  };
  safestFixPlan: string;
  expectedPostFixScore: number;
  expectedPostFixDecision: string;
  simulationSteps: Array<{
    fixId: string;
    title: string;
    simulatedScore: number;
    simulatedDecision: string;
    scoreDelta: number;
  }>;
  goNoGo: "GO" | "GO WITH CONDITIONS" | "NO-GO";
  goNoGoReason: string;
  executeBatchCalled: false;
  breezyWrites: false;
  liveModeEnabled: boolean;
  paperworkSent: false;
  thresholdChanged: false;
};
