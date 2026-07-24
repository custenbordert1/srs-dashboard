export const P253_PHASE = "P253-controlled-live-paperwork-send";
export const P253_OPS_DATE = "2026-07-23";
export const P253_CONFIRMATION_PHRASE = "SEND 1 PAPERWORK PACKET";
export const P253_BY_USER = "p253-controlled-live-paperwork-send";

export type P253Mode = "live" | "aborted" | "dry_run_blocked";

export type P253ResultCode =
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
  | "aborted_system";

export type P253Counts = {
  applicantsEvaluated: number;
  eligible: number;
  sentSuccessfully: number;
  failed: number;
  skipped: number;
  alreadySent: number;
  alreadySigned: number;
  duplicatePrevented: number;
  distanceBlocked: number;
  missingRecruiter: number;
  missingDm: number;
  coverageBlocked: number;
  qualificationFailed: number;
  exclusionList: number;
  missingIdentity: number;
  missingEmail: number;
  missingPhone: number;
  notPaperworkNeeded: number;
  otherBlocked: number;
};

export type P253CandidateRow = {
  candidateId: string;
  name: string;
  location: string;
  recruiter: string;
  districtManager: string;
  workflowStatus: string;
  paperworkStatus: string;
  nearestMiles: number | null;
  coverageKnown: boolean;
  eligible: boolean;
  blockers: string[];
  result: P253ResultCode;
  signatureRequestId: string | null;
  sentAt: string | null;
  error: string | null;
};

export type P253RefreshSummary = {
  ingestionOk: boolean;
  ingestionDetail: string;
  newCandidates: number;
  totalCandidates: number;
  workflowsTouched: number;
  recruiterAssignmentsApplied: number;
  dmAssignmentsApplied: number;
  dropboxReconciled: number;
  notes: string[];
};

export type P253ProductionPreflight = {
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

export type P253IntegrityCheck = {
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

export type P253AuditEntry = {
  at: string;
  action: string;
  candidateId: string | null;
  detail: string;
  signatureRequestId?: string | null;
};

export type P253MissionResult = {
  phase: typeof P253_PHASE;
  opsDate: typeof P253_OPS_DATE;
  generatedAt: string;
  mode: P253Mode;
  productionModeConfirmed: boolean;
  testMode: boolean | null;
  aborted: boolean;
  abortReason: string | null;
  refresh: P253RefreshSummary;
  preflight: P253ProductionPreflight;
  counts: P253Counts;
  candidates: P253CandidateRow[];
  integrity: P253IntegrityCheck;
  auditTrail: P253AuditEntry[];
  artifacts: string[];
  safety: {
    liveModeAuthorized: true;
    productionDropboxOnly: true;
    testModeForbidden: true;
    simulatedSends: 0;
    reminderEmailsSent: 0;
    melWrites: 0;
    breezyStageWrites: 0;
    duplicateCreatingRetries: 0;
  };
};
