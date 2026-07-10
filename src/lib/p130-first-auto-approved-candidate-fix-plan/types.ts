export const P130_SOURCE_PHASE = "P130";
export const P130_ANALYSIS_MODE = "previewOnly" as const;
export const P130_TARGET_CANDIDATE_ID = "92fa58cc5870";
export const P130_TARGET_CANDIDATE_NAME = "Tyree nicole Gilley";

export type FixCategory =
  | "manual_taylor"
  | "software_prepares_locally"
  | "cannot_fix_safely";

export type FixBlockerType =
  | "data_issue"
  | "mapping_issue"
  | "policy_issue"
  | "template_issue"
  | "safety_issue";

export type CandidateCurrentState = {
  candidateId: string;
  candidateName: string;
  email: string;
  emailValid: boolean;
  duplicateStatus: { isDuplicate: boolean; detail: string };
  alreadySentStatus: { alreadySent: boolean; detail: string };
  breezyJob: {
    positionId: string | null;
    positionName: string | null;
    nativePublishedJob: boolean;
    closedJob: boolean;
    recommendedPositionId: string | null;
    recommendedPositionTitle: string | null;
    recommendedJobPublished: boolean;
  };
  projectMapping: {
    p109Decision: string | null;
    approvedMappingQualifies: boolean;
    mappingSource: string;
    mappingReasons: string[];
    overlayBlocker: string | null;
    baselineBlocker: string | null;
  };
  mappingConfidence: number;
  recruiterAssignment: { assigned: boolean; recruiter: string | null };
  questionnaireResume: {
    hasResume: boolean;
    paperworkReady: boolean;
    complete: boolean;
  };
  template: { templateKey: string | null; available: boolean };
  eligibilityStatus: string;
  approvalScore: number;
  approvalDecision: string;
  scoreFactors: Record<string, number>;
  approvalReasons: string[];
  humanReviewReasons: string[];
  blockingReasons: string[];
  safetyReasons: string[];
  scoreGapToAutoApprove: number;
};

export type RequiredFix = {
  id: string;
  title: string;
  description: string;
  category: FixCategory;
  blockerType: FixBlockerType;
  currentValue: string;
  targetValue: string;
  pointsGained: number;
  policyGate: boolean;
  manualSteps: string[];
  softwareCanPrepare: string[];
  cannotFixSafely: string | null;
};

export type FixSimulationStep = {
  fixId: string;
  title: string;
  simulatedScore: number;
  simulatedDecision: string;
  scoreDelta: number;
  cumulativeFixes: string[];
  notes: string[];
};

export type FirstAutoApprovedCandidateFixPlanReport = {
  sourcePhase: typeof P130_SOURCE_PHASE;
  generatedAt: string;
  mode: typeof P130_ANALYSIS_MODE;
  targetCandidateId: typeof P130_TARGET_CANDIDATE_ID;
  targetCandidateName: typeof P130_TARGET_CANDIDATE_NAME;
  policy: import("@/lib/autonomous-paperwork-approval-engine/types").ApprovalPolicy;
  currentState: CandidateCurrentState;
  requiredFixes: RequiredFix[];
  simulation: {
    steps: FixSimulationStep[];
    postFixScore: number;
    postFixDecision: string;
    postFixFactors: Record<string, number>;
    allFixesApplied: string[];
  };
  manualChecklist: string[];
  cannotFixSafely: string[];
  goNoGo: "GO" | "GO WITH CONDITIONS" | "NO-GO";
  goNoGoReason: string;
  executeBatchCalled: false;
  breezyWrites: false;
  liveModeEnabled: boolean;
  paperworkSent: false;
  thresholdChanged: false;
};
