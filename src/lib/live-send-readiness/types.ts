export const P99_SOURCE_PHASE = "P99";
export const P99_CONFIRMATION_PHRASE = "APPROVE LIVE SEND READINESS";
export const P99_LIVE_SEND = false as const;

export type LiveSendReadinessGateId =
  | "p84_eligible"
  | "valid_email"
  | "no_duplicate"
  | "not_already_sent"
  | "not_signed"
  | "not_rejected"
  | "not_inactive"
  | "published_job"
  | "recruiter_assigned"
  | "dm_assigned"
  | "workflow_paperwork_needed"
  | "action_send_paperwork"
  | "rollback_available"
  | "audit_log_exists";

export type LiveSendReadinessGate = {
  id: LiveSendReadinessGateId;
  label: string;
  passed: boolean;
  detail: string | null;
};

export type LiveSendReadinessCandidateEntry = {
  candidateId: string;
  candidateName: string;
  email: string;
  recruiter: string;
  dm: string;
  ready: boolean;
  blockingReasons: string[];
  gates: LiveSendReadinessGate[];
};

export type LiveSendSafetyLockId =
  | "live_send_disabled"
  | "executive_flag_required"
  | "confirmation_phrase_required"
  | "candidate_count_confirmation_required"
  | "dry_run_timestamp_required"
  | "rollback_artifact_present";

export type LiveSendSafetyLock = {
  id: LiveSendSafetyLockId;
  label: string;
  satisfied: boolean;
  detail: string;
};

export type LiveSendReadinessMetrics = {
  readinessPassCount: number;
  readinessBlockedCount: number;
  totalCandidates: number;
};

export type LiveSendReadinessApproval = {
  approved: true;
  approvedBy: string;
  approvedByUserId: string;
  approvedAt: string;
  confirmationPhrase: string;
  candidateCountConfirmed: number;
  dryRunReportTimestamp: string;
  readyCandidateCount: number;
  liveSendEnabled: false;
  paperworkSent: false;
};

export type LiveSendReadinessApprovalFile = {
  version: 1;
  updatedAt: string;
  approval: LiveSendReadinessApproval | null;
};

export type LiveSendReadinessReport = {
  sourcePhase: typeof P99_SOURCE_PHASE;
  generatedAt: string;
  dryRunReportTimestamp: string;
  mtdRangeLabel: string;
  sectionTitle: "Live Send Readiness";
  cohortLabel: string;
  metrics: LiveSendReadinessMetrics;
  candidates: LiveSendReadinessCandidateEntry[];
  safetyLocks: LiveSendSafetyLock[];
  requiredConfirmationPhrase: typeof P99_CONFIRMATION_PHRASE;
  liveSend: typeof P99_LIVE_SEND;
  readinessApproved: boolean;
  approvalRecord: LiveSendReadinessApproval | null;
  auditLogPath: string;
  rollbackArtifactPath: string;
  finalStepBeforeLiveSend: string;
};

export type LiveSendReadinessApproveResult = {
  ok: true;
  approval: LiveSendReadinessApproval;
  report: LiveSendReadinessReport;
  warnings: string[];
};
