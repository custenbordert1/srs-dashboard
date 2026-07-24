export const P256_PHASE = "P256-controlled-live-recovered-send";
export const P256_OPS_DATE = "2026-07-23";
export const P256_CONFIRMATION_PHRASE = "SEND 1 PAPERWORK PACKET";
export const P256_BY_USER = "p256-controlled-live-recovered-send";
export const P256_SOURCE_ARTIFACT = "artifacts/p255-recovery-report.json";

/** Hard allowlist — names authorized for live production send (case-insensitive). */
export const P256_AUTHORIZED_NAMES = ["sadio mustafa", "melissa lloyd"] as const;

export type P256Mode = "live" | "aborted" | "dry_run_blocked";

export type P256ResultCode =
  | "eligible_pending_send"
  | "sent"
  | "failed"
  | "skipped_state_change"
  | "skipped_new_packet"
  | "skipped_quota_abort"
  | "already_sent"
  | "already_signed"
  | "duplicate_prevented"
  | "distance_blocked"
  | "missing_recruiter"
  | "missing_dm"
  | "coverage_blocked"
  | "missing_identity"
  | "missing_email"
  | "missing_phone"
  | "qualification_failed"
  | "exclusion_list"
  | "not_paperwork_needed"
  | "other_blocked"
  | "aborted_system"
  | "not_authorized"
  | "refresh_failed"
  | "gate_failed_after_refresh";

export type P256Counts = {
  evaluated: number;
  eligible: number;
  sent: number;
  skipped: number;
  failures: number;
  alreadySent: number;
  alreadySigned: number;
  gateFailed: number;
};

export type P256CandidateRow = {
  candidateId: string;
  name: string;
  email: string;
  location: string;
  recruiter: string;
  districtManager: string;
  workflowStatus: string;
  paperworkStatus: string;
  nearestMiles: number | null;
  coverageKnown: boolean;
  eligible: boolean;
  blockers: string[];
  result: P256ResultCode;
  signatureRequestId: string | null;
  sentAt: string | null;
  error: string | null;
  refreshedFromBreezy: boolean;
  positionId: string | null;
};

export type P256AuthorizedTarget = {
  candidateId: string;
  name: string;
  email: string;
  positionId: string | null;
  /** Durable home location recovered by P255 (city/state). */
  city: string;
  state: string;
  source: typeof P256_SOURCE_ARTIFACT;
};

export type P256RefreshSummary = {
  targets: number;
  breezyHits: number;
  breezyMisses: number;
  ingestionWrites: number;
  notes: string[];
};

export type P256QuotaSnapshot = {
  accountQuotaRemaining: number | null;
  rateLimitRemaining: number | null;
  probedAt: string;
  error: string | null;
};

export type P256ProductionPreflight = {
  ok: boolean;
  aborted: boolean;
  blockers: string[];
  testMode: boolean | null;
  productionModeConfirmed: boolean;
  apiKeyPresent: boolean;
  templateConfigured: boolean;
  accountQuotaRemaining: number | null;
  rateLimitRemaining: number | null;
  livePilotEnvOk: boolean;
  confirmationPhraseOk: boolean;
  detail: string;
};

export type P256IntegrityCheck = {
  verified: boolean;
  createdRequestIds: string[];
  verifiedRequestIds: string[];
  missingRequestIds: string[];
  workflowMismatches: Array<{
    candidateId: string;
    expectedSignatureRequestId: string;
    workflowStatus: string;
    paperworkStatus: string;
    signatureRequestId: string | null;
  }>;
  duplicatePacketsDetected: number;
  detail: string;
};

export type P256AuditEntry = {
  at: string;
  action: string;
  candidateId: string | null;
  detail: string;
  signatureRequestId?: string | null;
};

export type P256MissionResult = {
  phase: typeof P256_PHASE;
  opsDate: typeof P256_OPS_DATE;
  generatedAt: string;
  mode: P256Mode;
  productionModeConfirmed: boolean;
  testMode: boolean | null;
  aborted: boolean;
  abortReason: string | null;
  authorizedTargets: P256AuthorizedTarget[];
  refresh: P256RefreshSummary;
  preflight: P256ProductionPreflight;
  quotaBefore: P256QuotaSnapshot;
  quotaAfter: P256QuotaSnapshot;
  counts: P256Counts;
  candidates: P256CandidateRow[];
  integrity: P256IntegrityCheck;
  auditTrail: P256AuditEntry[];
  artifacts: string[];
  safety: {
    liveModeAuthorized: true;
    productionDropboxOnly: true;
    testModeForbidden: true;
    onlyAuthorizedCandidates: true;
    noBulkSends: true;
    noRetriesOnFailure: true;
    simulatedSends: 0;
    reminderEmailsSent: 0;
    melWrites: 0;
    breezyStageWrites: 0;
    duplicateCreatingRetries: 0;
    unauthorizedAttempts: 0;
  };
};
