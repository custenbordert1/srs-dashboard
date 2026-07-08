export const P168_1_SOURCE_PHASE = "P168.1";

export type P1681DecisionGrade =
  | "Excellent"
  | "Healthy"
  | "Caution"
  | "Intervention Required";

export type P1681GateCheckItem = {
  id: string;
  label: string;
  pass: boolean;
  detail: string | null;
};

export type P1681DecisionScore = {
  decisionScore: number;
  decisionGrade: P1681DecisionGrade;
  factors: Array<{ id: string; label: string; weight: number; contribution: number }>;
};

export type P1681SystemStatus = {
  observationMode: boolean;
  observationModeLabel: string;
  runnerStatus: string;
  continuousMode: boolean;
  daemonActive: boolean;
  productionReadinessScore: number | null;
  decisionScore: number;
  decisionGrade: P1681DecisionGrade;
  deferredReconciliationCount: number;
  monitorBudget: number;
};

export type P1681BlockingSection = {
  checklist: P1681GateCheckItem[];
  nextExpectedApprovalAt: string | null;
  actionRequiredBeforeApproval: string | null;
  approveDisabledReason: string | null;
};

export type P1681ExecutiveDecisionCenterView = {
  sourcePhase: typeof P168_1_SOURCE_PHASE;
  generatedAt: string;
  systemStatus: P1681SystemStatus;
  recommendation: {
    id: string;
    action: string;
    title: string;
    reason: string;
    confidence: number;
    expectedSends: number;
    expectedQueueReduction: number;
    projectedDropboxRequests: number;
    estimatedRuntimeMs: number | null;
    queueRemaining: number;
    projectedQueueAfterCycle: number;
    schedulerRecommendation: string;
    nextRecommendedRunAt: string | null;
  };
  blocking: P1681BlockingSection;
  lastExecution: {
    at: string | null;
    paperworkSent: number | null;
    durationMs: number | null;
    dropboxRequests: number | null;
    errors: number | null;
    queueReduction: number | null;
    result: string | null;
    executiveEmail: string | null;
  };
  history: Array<{
    id: string;
    at: string;
    executive: string;
    recommendation: string;
    result: string | null;
    paperworkSent: number | null;
    durationMs: number | null;
    errors: number | null;
  }>;
  safety: {
    continuousModeEnabled: boolean;
    daemonActive: boolean;
    manualApprovalRequired: true;
  };
  warnings: string[];
};
