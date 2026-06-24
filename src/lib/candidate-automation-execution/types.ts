export type CandidateExecutionType =
  | "send-paperwork-request"
  | "schedule-recruiter-follow-up"
  | "create-escalation-task";

export type CandidateExecutionStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "failed"
  | "retrying";

export type CandidateExecutionMode = "disabled" | "semi-automatic" | "automatic";

export type CandidateExecutionPolicy = {
  /** Master switch — default off until explicitly enabled. */
  enabled: boolean;
  mode: CandidateExecutionMode;
  dryRun: boolean;
  paperwork: { enabled: boolean };
  escalation: { enabled: boolean; requireApproval: boolean };
  maxRetries: number;
  escalationDelayHours: number;
  maxEscalationsPerRun: number;
  updatedAt: string;
};

export type CandidateExecutionRecord = {
  executionId: string;
  orchestratorRunId?: string;
  candidateId: string;
  executionType: CandidateExecutionType;
  status: CandidateExecutionStatus;
  actionType?: string;
  requiredAction?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  failedAt?: string;
  retryCount: number;
  failureReason?: string;
  resultSummary?: string;
  automationRunId?: string;
};

export type CandidateExecutionDecision = {
  candidateId: string;
  executionType: CandidateExecutionType;
  actionType: string;
  requiredAction: string;
  reason: string;
  stalled: boolean;
};

export type CandidateExecutionRunSummary = {
  runAt: string;
  orchestratorRunId?: string;
  dryRun: boolean;
  eligibleExecutions: number;
  executed: number;
  blockedByPolicy: number;
  blockedByBatchCap: number;
};

export type CandidateExecutionResult = {
  ok: boolean;
  dryRun: boolean;
  eligibleExecutions: number;
  created: number;
  completed: number;
  failed: number;
  escalationsCreated: number;
  retriesAttempted: number;
  skipped: number;
  blockedByPolicy: number;
  blockedByBatchCap: number;
  errors: string[];
  warnings: string[];
};

export type CandidateExecutionHealth = {
  executionsToday: number;
  successRatePct: number;
  failedExecutions: number;
  escalationsCreated: number;
  averageCompletionMs: number;
  retryVolume: number;
  automationEffectivenessPct: number;
  totalExecutions: number;
  completedExecutions: number;
  pendingExecutions: number;
  policyEnabled: boolean;
  policyMode: CandidateExecutionMode;
  dryRun: boolean;
  paperworkEnabled: boolean;
  escalationEnabled: boolean;
  escalationRequireApproval: boolean;
  maxEscalationsPerRun: number;
  eligibleExecutions: number;
  executed: number;
  blockedByPolicy: number;
  blockedByBatchCap: number;
  lastRunAt: string | null;
};
