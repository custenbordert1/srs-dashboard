export const P126_SOURCE_PHASE = "P126";

export type OperationsTimeRange = "today" | "yesterday" | "last7days" | "lastHour" | "all";

export type OperationsFilter = {
  timeRange?: OperationsTimeRange;
  candidateQuery?: string;
  status?: string;
  approvalDecision?: string;
  failureReason?: string;
  errorsOnly?: boolean;
};

export type RunnerStatusPanel = {
  currentState: string;
  runningPausedIdle: "running" | "paused" | "idle" | "stopped";
  lastCycleAt: string | null;
  nextCycleAt: string | null;
  uptimeMs: number;
  heartbeat: { lastAt: string | null; stale: boolean; healthy: boolean };
  currentCandidate: { candidateId: string; candidateName: string } | null;
  currentAction: string;
  averageCycleTimeMs: number | null;
};

export type QueueSummaryPanel = {
  readyToSend: number;
  waitingApproval: number;
  humanReview: number;
  blocked: number;
  retryQueue: number;
  completedToday: number;
  failedToday: number;
  duplicatePrevented: number;
  skipped: number;
};

export type ActivityTimelineEntry = {
  auditId: string;
  at: string;
  candidateId: string | null;
  candidateName: string | null;
  action: string;
  result: string;
  durationMs: number | null;
  reason: string | null;
  source: "p125-runner" | "p123-orchestrator" | "p122-pilot";
};

export type CandidateDrilldown = {
  candidateId: string;
  candidateName: string;
  email: string;
  approvalDecision: string;
  approvalScore: number;
  approvalReasons: string[];
  safetyReasons: string[];
  humanReviewReasons: string[];
  blockingReasons: string[];
  safetyChecks: Array<{ id: string; label: string; passed: boolean; detail: string }>;
  eligibilityStatus: string;
  currentStage: string;
  queuePosition: number | null;
  mappingConfidence: number;
  approvedMappingReady: boolean;
  dropboxSignStatus: string;
  signatureRequestId: string | null;
  auditHistory: ActivityTimelineEntry[];
  decisionExplanation: string;
};

export type HealthDashboardPanel = {
  runnerHealth: "healthy" | "degraded" | "critical";
  dropboxSign: "healthy" | "degraded" | "unknown";
  approvalEngine: "healthy" | "degraded" | "unknown";
  orchestrator: "healthy" | "degraded" | "unknown";
  queue: "healthy" | "degraded" | "unknown";
  apiLatencyMs: number;
  lastSuccessfulSendAt: string | null;
  averageProcessingTimeMs: number | null;
  failures: number;
  retryBacklog: number;
};

export type ExecutiveMetricsPanel = {
  todaysSends: number;
  successRate: number;
  averageSendTimeMinutes: number;
  currentQueue: number;
  readyCandidates: number;
  approvalRate: number;
  humanReviewPercent: number;
  failurePercent: number;
};

export type DiagnosticsPanel = {
  recentErrors: string[];
  retryHistory: Array<{ candidateId: string; candidateName: string; error: string; attempt: number; nextRetryAt: string }>;
  safetyGateFailures: string[];
  duplicatePreventionEvents: string[];
  lockRecoveryEvents: string[];
  runnerRestartHistory: Array<{ at: string; action: string }>;
};

export type OperationsCommandCenterReport = {
  sourcePhase: typeof P126_SOURCE_PHASE;
  generatedAt: string;
  filters: OperationsFilter;
  runner: RunnerStatusPanel;
  queue: QueueSummaryPanel;
  timeline: ActivityTimelineEntry[];
  metrics: ExecutiveMetricsPanel;
  health: HealthDashboardPanel;
  candidateSummary: CandidateDrilldown[];
  failures: Array<{ candidateId: string; candidateName: string; error: string; failedAt: string }>;
  retries: Array<{ candidateId: string; candidateName: string; error: string; attempt: number; nextRetryAt: string }>;
  diagnostics: DiagnosticsPanel;
  executeBatchCalled: false;
  safetyConfirmation: {
    p122GatesPreserved: true;
    p124ApprovalPreserved: true;
    executeOneOnly: true;
    noBypassControls: true;
  };
};
