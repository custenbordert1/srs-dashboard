export const P100_SOURCE_PHASE = "P100";
export const P100_CONFIRMATION_PHRASE = "SEND 27 PAPERWORK PACKETS";
export const P100_EXPECTED_CANDIDATE_COUNT = 27;

export type ControlledLiveSendMode = "dryRun" | "executeOne" | "executeBatch";

export type ControlledLiveSendLockId =
  | "p99_readiness_approved"
  | "rollback_artifact_present"
  | "audit_log_present"
  | "live_send_enabled"
  | "executive_approval_flag"
  | "confirmation_phrase_verified"
  | "candidate_count_confirmed"
  | "no_blocked_candidates";

export type ControlledLiveSendLock = {
  id: ControlledLiveSendLockId;
  label: string;
  satisfied: boolean;
  detail: string;
};

export type ControlledLiveSendMetrics = {
  readyToSend: number;
  sent: number;
  skipped: number;
  failed: number;
  remaining: number;
  totalCandidates: number;
};

export type ControlledLiveSendCandidateStatus =
  | "ready"
  | "sent"
  | "skipped"
  | "failed"
  | "blocked";

export type ControlledLiveSendCandidateEntry = {
  candidateId: string;
  candidateName: string;
  email: string;
  status: ControlledLiveSendCandidateStatus;
  p84Eligible: boolean;
  blockingReasons: string[];
  signatureRequestId: string | null;
  lastExecutionAt: string | null;
};

export type ControlledLiveSendReport = {
  sourcePhase: typeof P100_SOURCE_PHASE;
  generatedAt: string;
  defaultMode: "dryRun";
  sectionTitle: "Controlled Live Send";
  cohortLabel: string;
  metrics: ControlledLiveSendMetrics;
  candidates: ControlledLiveSendCandidateEntry[];
  safetyLocks: ControlledLiveSendLock[];
  liveSend: boolean;
  p84Enabled: boolean;
  p84LiveMode: boolean;
  readinessApproved: boolean;
  requiredBatchConfirmationPhrase: typeof P100_CONFIRMATION_PHRASE;
  expectedCandidateCount: typeof P100_EXPECTED_CANDIDATE_COUNT;
  goNoGo: "go" | "no-go";
  goNoGoReason: string;
  auditLogPath: string;
  rollbackArtifactPath: string;
  executionStatePath: string;
};

export type ControlledLiveSendExecutionEntry = {
  id: string;
  at: string;
  phase: typeof P100_SOURCE_PHASE;
  mode: ControlledLiveSendMode;
  candidateId: string;
  candidateName: string;
  outcome: "simulated" | "sent" | "skipped" | "failed";
  beforeState: {
    workflowStatus: string;
    actionType: string | null;
    paperworkStatus: string;
    signatureRequestId: string | null;
  };
  afterState?: {
    workflowStatus: string;
    actionType: string | null;
    paperworkStatus: string;
    signatureRequestId: string | null;
  };
  signatureRequestId?: string;
  error?: string;
  simulated: boolean;
};

export type ControlledLiveSendStateFile = {
  version: 1;
  updatedAt: string;
  sentCandidateIds: string[];
  skippedCandidateIds: string[];
  failedCandidateIds: string[];
  lastExecutionAt: string | null;
  lastMode: ControlledLiveSendMode | null;
};

export type ControlledLiveSendResult = {
  ok: true;
  mode: ControlledLiveSendMode;
  stoppedEarly: boolean;
  stopReason: string | null;
  executed: ControlledLiveSendExecutionEntry[];
  report: ControlledLiveSendReport;
  warnings: string[];
};
