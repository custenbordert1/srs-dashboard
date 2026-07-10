export const P89_SOURCE_PHASE = "P89";
export const P89_PREVIEW_MODE = true as const;

export type P84UnlockCandidateGroup =
  | "current_eligible"
  | "unlockable"
  | "monitor_only"
  | "not_fixable";

export type P84UnlockScenarioFlags = {
  jobPublishOnly: boolean;
  recruiterAssignmentOnly: boolean;
  p83AdvancementOnly: boolean;
  allOperationalFixes: boolean;
};

export type P84UnlockRecoveryPlan = {
  candidateId: string;
  candidateName: string;
  breezyCandidateId: string;
  positionId: string;
  positionName: string;
  dmTerritory: string;
  suggestedDm: string;
  recommendedRecruiter: string;
  recruiterAssignmentReason: string;
  currentWorkflowStage: string;
  breezyStage: string;
  requiredFixes: string[];
  jobMustBePublished: boolean;
  recruiterAssignmentMissing: boolean;
  p83ShouldAdvance: boolean;
  expectedP84ResultAfterFixes: "eligible" | "ineligible";
  unlockScenarios: P84UnlockScenarioFlags;
  group: P84UnlockCandidateGroup;
  grade: string;
  questionnaireReady: boolean;
};

export type P84UnlockPreviewSummary = {
  currentP84Eligible: number;
  unlockableAfterAllOperationalFixes: number;
  unlockableAfterJobPublishOnly: number;
  unlockableAfterRecruiterAssignmentOnly: number;
  unlockableAfterP83AdvancementOnly: number;
  monitorOnly: number;
  notFixable: number;
  totalReadyGradeCandidates: number;
  operationalOrder: string[];
};

export type P84UnlockPreviewReport = {
  sourcePhase: typeof P89_SOURCE_PHASE;
  previewMode: typeof P89_PREVIEW_MODE;
  generatedAt: string;
  mtdRangeLabel: string;
  summary: P84UnlockPreviewSummary;
  readinessLabels: {
    questionnaireReady: string;
    workflowReady: string;
    p84SendEligible: string;
    paperworkAlreadySent: string;
  };
  recoveryPlans: P84UnlockRecoveryPlan[];
  currentEligible: P84UnlockRecoveryPlan[];
  unlockable: P84UnlockRecoveryPlan[];
  monitorOnly: P84UnlockRecoveryPlan[];
  notFixable: P84UnlockRecoveryPlan[];
  remainingBlockersBeforeLiveSend: string[];
};
