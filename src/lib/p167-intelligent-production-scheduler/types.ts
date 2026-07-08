export const P167_SOURCE_PHASE = "P167";

export type P167SchedulerRecommendation =
  | "READY_NOW"
  | "WAIT_2_MINUTES"
  | "WAIT_5_MINUTES"
  | "WAIT_10_MINUTES"
  | "WAIT_15_MINUTES"
  | "NO_ELIGIBLE_CANDIDATES"
  | "PAUSE_INVESTIGATION_REQUIRED";

export type P167SimulationScenario = "run_now" | "run_in_2_min" | "run_in_5_min" | "run_in_10_min" | "run_in_15_min";

export type P167SchedulerDecision = {
  recommendation: P167SchedulerRecommendation;
  confidence: number;
  reason: string;
  limitingFactor: string | null;
  nextRecommendedRunAt: string | null;
  estimatedCandidatesNextCycle: number;
  projectedDropboxApiUsage: {
    postRequests: number;
    getRequests: number;
    totalRequests: number;
    withinBudget: boolean;
    budgetCeiling: number;
  };
  projectedQueueAfterCycle: number;
};

export type P167CycleTimelineEntry = {
  cycleId: string;
  startedAt: string;
  completedAt: string | null;
  durationMs: number;
  paperworkSent: number;
  apiRequestsEstimate: number;
  apiRequestsSource: "measured" | "estimated";
  errors: number;
  queueBefore: number | null;
  queueAfter: number | null;
  dryRun: boolean;
};

export type P167SimulationResult = {
  scenario: P167SimulationScenario;
  delayMinutes: number;
  recommendation: P167SchedulerRecommendation;
  expectedSends: number;
  expectedApiUsage: { post: number; get: number; total: number };
  expectedQueueReduction: number;
  expectedBacklog: number;
  notes: string[];
};

export type P167ProductionSchedulerReport = {
  sourcePhase: typeof P167_SOURCE_PHASE;
  generatedAt: string;
  decision: P167SchedulerDecision;
  context: {
    eligibleNow: number;
    queueRemaining: number;
    waitingOnSignature: number;
    readyAfterRecruiterAssignment: number;
    activeSignatureCount: number;
    deferredReconciliationCount: number;
    recruitersAvailable: number;
    timeSinceLastCycleMs: number | null;
    lastCycleAt: string | null;
    lastSuccessfulCycleAt: string | null;
    dropboxRequestsPerMinute: number;
    dropboxRateLimitRemaining: number | null;
    dropboxResponses429: number;
    dropboxThrottlingDetected: boolean;
    recentSendFailures: number;
    recentWorkflowFailures: number;
    productionReadinessScore: number | null;
    processingLockHeld: boolean;
    daemonActive: boolean;
    continuousModeEnabled: boolean;
    runnerHealthy: boolean;
    duplicateProtectionActive: boolean;
    monitorBudget: number;
    sendCapPerCycle: number;
    todayPaperworkSent: number;
    todayFailures: number;
  };
  timeline: P167CycleTimelineEntry[];
  simulations: P167SimulationResult[];
  warnings: string[];
};
