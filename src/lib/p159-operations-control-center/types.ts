export const P159_SOURCE_PHASE = "P159";

export type P159SystemMode =
  | "manual_only"
  | "paused"
  | "ready"
  | "running"
  | "blocked"
  | "degraded";

export type P159Recommendation =
  | "continue_manual_batches"
  | "safe_for_capped_cycle"
  | "pause_due_to_failures"
  | "ready_for_server_deployment"
  | "ready_for_continuous_observation"
  | "not_ready_for_autonomous_sending";

export type P159RunnerStatusSection = {
  systemMode: P159SystemMode;
  continuousEnabled: boolean;
  schedulerMode: string;
  daemonRunning: boolean;
  autopilotEnabled: boolean;
  lastCycleAt: string | null;
  nextCycleAt: string | null;
  intervalMinutes: number;
  uptimeMs: number | null;
  serverStartTime: string | null;
  processingLockHeld: boolean;
  lockRunId: string | null;
  lockAgeMs: number | null;
  staleLockWarning: boolean;
  lastError: string | null;
  maxSendsPerCycle: number;
  maxAssignmentsPerCycle: number;
};

export type P159SendBatchSummary = {
  batchNumber: number;
  startAt: string;
  endAt: string;
  sendCount: number;
  sendTimes: string[];
};

export type P159TodayActivitySection = {
  paperworkSent: number;
  sendBatchCount: number;
  sendBatches: P159SendBatchSummary[];
  signedToday: number;
  viewedToday: number;
  pendingSignatures: number;
  duplicatesPrevented: number;
  failures: number;
};

export type P159QueueStatusSection = {
  candidatesEvaluated: number;
  eligibleNow: number;
  readyAfterRecruiterAssignment: number;
  readyAfterWorkflowTransition: number;
  waitingOnSignature: number;
  alreadySent: number;
  alreadySigned: number;
  duplicates: number;
  invalidEmails: number;
  manualReview: number;
  blocked: number;
  queueRemaining: number;
};

export type P159BatchTrigger = "manual" | "daemon" | "unknown";

export type P159BatchHistoryRow = {
  id: string;
  source: string;
  sourceLabel: string;
  trigger: P159BatchTrigger;
  startAt: string;
  endAt: string;
  durationMs: number;
  candidatesEvaluated: number | null;
  recruitersAssigned: number;
  workflowTransitions: number;
  paperworkSent: number;
  failures: number;
  dryRun: boolean;
};

export type P159SafetyChecksSection = {
  duplicateProtectionActive: boolean;
  activeSignatureProtectionActive: boolean;
  invalidEmailProtectionActive: boolean;
  alreadySentProtectionActive: boolean;
  breezyWriteProtectionActive: boolean;
  capsActive: boolean;
  stopOnErrorActive: boolean;
};

export type P159ContinuousModeDisplay = {
  available: boolean;
  enabled: boolean;
  controlAllowed: false;
  note: string;
};

export type P159LiveCycleGates = {
  executiveSessionRequired: true;
  confirmLiveRequired: true;
  envFlagRequired: string;
  envFlagEnabled: boolean;
  maxSendsPerCycle: number;
};

export type P159OperationsControlCenter = {
  sourcePhase: typeof P159_SOURCE_PHASE;
  generatedAt: string;
  runner: P159RunnerStatusSection;
  today: P159TodayActivitySection;
  queue: P159QueueStatusSection;
  batchHistory: P159BatchHistoryRow[];
  safety: P159SafetyChecksSection;
  continuousMode: P159ContinuousModeDisplay;
  liveCycleGates: P159LiveCycleGates;
  recommendation: P159Recommendation;
  recommendationDetail: string;
};

export type P159ControlAction =
  | "refresh"
  | "dry_cycle"
  | "live_cycle"
  | "pause"
  | "resume"
  | "emergency_stop";

export type P159ControlResult = {
  ok: boolean;
  action: P159ControlAction;
  message: string;
  dryRun: boolean;
  dashboard: P159OperationsControlCenter;
  cycleReport?: unknown;
};

export type P159WorkflowAuditEntry = {
  id: string;
  candidateId: string;
  action: string;
  ok: boolean;
  at: string;
  byUserId?: string;
  metadata?: Record<string, string | boolean | number>;
};
