export const P149_SOURCE_PHASE = "P149";
export const P149_CERTIFICATION_MODE = "auditOnly" as const;

export type CertificationResult = "PASS" | "FAIL" | "WARN";

export type SubsystemValidation = {
  phase: "P143" | "P144" | "P145" | "P146" | "P147" | "P148";
  name: string;
  result: CertificationResult;
  detail: string;
  apiOk: boolean;
  uiOk: boolean;
  metricsOk: boolean;
  auditOk: boolean;
};

export type E2EWorkflowTransition = {
  step: number;
  stage: string;
  phase: string;
  description: string;
  validated: boolean;
  sampleCount: number;
};

export type LiveDryRunSummary = {
  candidatesEvaluated: number;
  eligibleInitialPaperwork: number;
  eligibleReminders: number;
  blockedCandidates: number;
  falsePositives: number;
  falseNegatives: number;
  executionTimeMs: number;
  phaseTimings: Array<{ phase: string; durationMs: number; success: boolean }>;
  safetyChecks: Record<string, boolean>;
};

export type GoLiveChecklistItem = {
  id: string;
  category: "environment" | "integration" | "scheduler" | "secrets" | "monitoring" | "rollback";
  item: string;
  status: "COMPLETE" | "PARTIAL" | "NOT_READY";
  notes: string;
};

export type PerformanceMetrics = {
  runDurationMs: number;
  phaseDurations: Array<{ phase: string; durationMs: number }>;
  apiLatencyMs: number;
  cacheHitRate: number;
  snapshotAgeMinutes: number | null;
};

export type ProductionAlert = {
  id: string;
  severity: "warning" | "critical";
  message: string;
  detail: string;
};

export type AutomationActivationGuide = {
  automation: string;
  envFlag: string;
  safeToEnable: boolean;
  requiresManualApproval: boolean;
  notes: string;
};

export type BusinessImpactEstimate = {
  estimatedRecruiterHoursSavedPerWeek: number;
  estimatedManualTouchReductionPercent: number;
  candidatesProcessedToday: number;
  paperworkSentToday: number;
  remindersSentToday: number;
};

export type ProductionReadinessReport = {
  sourcePhase: typeof P149_SOURCE_PHASE;
  generatedAt: string;
  mode: typeof P149_CERTIFICATION_MODE;
  subsystemValidations: SubsystemValidation[];
  e2eWorkflowTransitions: E2EWorkflowTransition[];
  liveDryRun: LiveDryRunSummary;
  goLiveChecklist: GoLiveChecklistItem[];
  performance: PerformanceMetrics;
  alerts: ProductionAlert[];
  automationActivation: AutomationActivationGuide[];
  businessImpact: BusinessImpactEstimate;
  knownRisks: string[];
  recommendedConfiguration: Record<string, string>;
  productionReadinessScore: number;
  finalRecommendation: "NOT READY" | "GO LIVE WITH CONDITIONS" | "GO LIVE";
  executeBatchCalled: false;
  breezyWrites: false;
  paperworkSent: false;
  liveModeEnabled: boolean;
};

export type ProductionOperationsSnapshot = {
  sourcePhase: typeof P149_SOURCE_PHASE;
  generatedAt: string;
  automationStatus: string;
  orchestratorEnabled: boolean;
  lastRun: string | null;
  lastSuccessfulRun: string | null;
  nextRun: string | null;
  failures: string[];
  warnings: string[];
  candidatesProcessedToday: number;
  paperworkSentToday: number;
  reminder1Today: number;
  reminder2Today: number;
  blockedCandidates: number;
  automationSuccessPercent: number;
  averagePaperworkTurnaroundHours: number;
  estimatedRecruiterHoursSaved: number;
  alerts: ProductionAlert[];
  executeBatchCalled: false;
  breezyWrites: false;
};

export type ObservabilityEntry = {
  id: string;
  at: string;
  source: "P145" | "P148";
  type: string;
  candidateId: string | null;
  summary: string;
  executed: boolean;
  duplicatePrevented: boolean;
  sendResult: string | null;
};

export type ObservabilitySearchResult = {
  sourcePhase: typeof P149_SOURCE_PHASE;
  generatedAt: string;
  query: string | null;
  total: number;
  entries: ObservabilityEntry[];
};
