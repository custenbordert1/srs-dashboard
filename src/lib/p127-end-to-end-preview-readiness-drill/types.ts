export const P127_SOURCE_PHASE = "P127";
export const P127_DRILL_MODE = "previewOnly" as const;

export type DrillStepStatus = "PASS" | "WARN" | "FAIL";

export type PreviewDrillStep = {
  id: string;
  label: string;
  status: DrillStepStatus;
  detail: string;
};

export type PilotRecommendation = {
  candidateId: string;
  candidateName: string;
  email: string;
  approvalScore: number;
  approvalDecision: string;
  onPilotAllowlist: boolean;
  queuePosition: number | null;
  reason: string;
} | null;

export type PreviewReadinessDrillReport = {
  sourcePhase: typeof P127_SOURCE_PHASE;
  generatedAt: string;
  mode: typeof P127_DRILL_MODE;
  drillSteps: PreviewDrillStep[];
  totalCandidatesEvaluated: number;
  autoApproved: number;
  humanApproval: number;
  blocked: number;
  waiting: number;
  rejectedForSafety: number;
  readyForPilot: number;
  pilotRecommendation: PilotRecommendation;
  safetyGates: Array<{ id: string; label: string; passed: boolean; detail: string }>;
  goNoGo: "GO" | "GO WITH CONDITIONS" | "NO-GO";
  goNoGoReason: string;
  remainingStepsBeforeFirstLiveSend: string[];
  validations: {
    candidateIngestion: DrillStepStatus;
    approvalEngine: DrillStepStatus;
    orchestratorEligibility: DrillStepStatus;
    sendQueueCreation: DrillStepStatus;
    runnerOneCyclePreview: DrillStepStatus;
    operationsCommandCenter: DrillStepStatus;
    auditTimeline: DrillStepStatus;
    retryQueue: DrillStepStatus;
    duplicatePrevention: DrillStepStatus;
    pilotAllowlistReadiness: DrillStepStatus;
  };
  executeBatchCalled: false;
  breezyWrites: false;
  liveModeEnabled: boolean;
  paperworkSent: false;
};
