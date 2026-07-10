export const P154_SOURCE_PHASE = "P154";
export const P154_DEFAULT_MAX_ASSIGNMENTS = 25;
export const P154_DEFAULT_MAX_SENDS = 10;

export type AutopilotHealthStatus = "healthy" | "degraded" | "unhealthy";

export type AutopilotDependencyCheck = {
  id: string;
  label: string;
  status: AutopilotHealthStatus;
  detail: string;
};

export type AutopilotSystemHealthReport = {
  generatedAt: string;
  overallStatus: AutopilotHealthStatus;
  healthy: boolean;
  checks: AutopilotDependencyCheck[];
  abortReason: string | null;
};

export type AutopilotDashboardMetrics = {
  candidatesEvaluated: number;
  recruitersAssigned: number;
  paperworkSent: number;
  paperworkCompleted: number;
  paperworkSkipped: number;
  duplicatesPrevented: number;
  failures: number;
  webhookCompletions: number;
  averageProcessingTimeMs: number;
  queueDepth: number;
  lastSuccessfulCycleAt: string | null;
};

export type AutopilotEnabledFeatures = {
  p151RecruiterAssignment: boolean;
  p152ImmediatePaperwork: boolean;
  freshIngestionRescue: boolean;
  automaticWorkflowAdvancement: boolean;
  webhookCompletionProcessing: boolean;
  duplicatePrevention: boolean;
  continuousIngestion: boolean;
};

export type ControlledProductionAutopilotCycleReport = {
  sourcePhase: typeof P154_SOURCE_PHASE;
  generatedAt: string;
  dryRun: boolean;
  autopilotEnabled: boolean;
  paused: boolean;
  pausedReason: string | null;
  health: AutopilotSystemHealthReport;
  enabledFeatures: AutopilotEnabledFeatures;
  limits: {
    maxRecruiterAssignmentsPerCycle: number;
    maxPaperworkSendsPerCycle: number;
    stopOnFirstError: boolean;
  };
  cycle: {
    candidatesEvaluated: number;
    recruitersAssigned: number;
    paperworkSent: number;
    paperworkSkipped: number;
    duplicatesPrevented: number;
    failures: number;
    executionTimeMs: number;
    webhookStatus: string;
    queueRemaining: number;
    stoppedOnError: boolean;
    capReachedAssignments: boolean;
    capReachedSends: boolean;
    sentCandidateIds: string[];
  };
  dashboard: AutopilotDashboardMetrics;
  safetyFlags: {
    breezyWrites: false;
    breezyStageMovement: false;
    executeBatchCalled: false;
    duplicatePreventionActive: true;
    auditLoggingEnabled: true;
  };
  rollbackRecommendation: string;
  /** IDs of candidates who received paperwork during this controlled cycle. */
  sentCandidateIds: string[];
};

export type AutopilotState = {
  version: string;
  autopilotStatus: "active" | "paused" | "stopped";
  paused: boolean;
  pausedReason: string | null;
  enabledFeatures: AutopilotEnabledFeatures;
  limits: {
    maxRecruiterAssignmentsPerCycle: number;
    maxPaperworkSendsPerCycle: number;
  };
  dashboard: AutopilotDashboardMetrics;
  lastCycleAt: string | null;
  lastSuccessfulCycleAt: string | null;
  lastError: string | null;
  updatedAt: string;
};
