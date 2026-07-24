export const P260_PHASE = "P260-live-paperwork-workspace";
export const P260_SOURCE = "Job Command Center";
export const P260_BY_USER = "p260-job-command-center";
export const P260_CONFIRMATION_PHRASE =
  "I reviewed this candidate and authorize one production Dropbox Sign paperwork packet.";

export type P260Mode = "preview" | "send" | "cancelled";

export type P260TypedConfirmReason =
  | "distance_40_60"
  | "prior_expired_packet"
  | "manually_recovered"
  | "nonstandard_override";

export type P260HardBlocker =
  | "quota_unavailable"
  | "quota_zero"
  | "missing_credentials"
  | "missing_template"
  | "test_mode_forbidden"
  | "live_pilot_env"
  | "confirmation_phrase"
  | "typed_confirmation_required"
  | "active_packet"
  | "viewed_packet"
  | "signed_packet"
  | "duplicate"
  | "missing_identity"
  | "missing_email"
  | "missing_phone"
  | "missing_recruiter"
  | "missing_dm"
  | "coverage_blocked"
  | "distance_over_60"
  | "not_paperwork_needed"
  | "idempotency_already_sent"
  | "in_flight"
  | "bulk_forbidden"
  | "candidate_not_found"
  | "other";

export type P260AuditAction =
  | "preview_opened"
  | "confirm_shown"
  | "typed_confirm_required"
  | "confirm_cancelled"
  | "pre_send_refresh"
  | "preflight_checked"
  | "eligibility_evaluated"
  | "send_attempt"
  | "send_success"
  | "send_failed"
  | "quota_blocked"
  | "credentials_blocked"
  | "packet_blocked"
  | "idempotency_blocked"
  | "timeout_reconcile"
  | "post_send_verify"
  | "workflow_paperwork_sent";

export type P260AuditEntry = {
  at: string;
  action: P260AuditAction;
  candidateId: string | null;
  detail: string;
  signatureRequestId?: string | null;
  source: typeof P260_SOURCE;
};

export type P260ProductionPreflight = {
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

export type P260CandidateSnapshot = {
  candidateId: string;
  name: string;
  email: string;
  phone: string;
  workflowStatus: string;
  paperworkStatus: string;
  signatureRequestId: string | null;
  paperworkSentAt: string | null;
  paperworkViewedAt: string | null;
  paperworkSignedAt: string | null;
  recruiter: string;
  districtManager: string;
  templateKey: string;
  nearestMiles: number | null;
  coverageKnown: boolean;
  dropboxStatus: string | null;
  priorExpiredPacket: boolean;
  manuallyRecovered: boolean;
};

export type P260Eligibility = {
  eligible: boolean;
  hardBlockers: P260HardBlocker[];
  typedConfirmReasons: P260TypedConfirmReason[];
  requiresTypedConfirm: boolean;
  detail: string;
  snapshot: P260CandidateSnapshot;
  idempotencyKey: string;
};

export type P260PreviewResult = {
  ok: boolean;
  mode: "preview";
  phase: typeof P260_PHASE;
  source: typeof P260_SOURCE;
  confirmationPhrase: typeof P260_CONFIRMATION_PHRASE;
  preflight: P260ProductionPreflight;
  eligibility: P260Eligibility;
  auditTrail: P260AuditEntry[];
  canSend: boolean;
  detail: string;
};

export type P260SendResult = {
  ok: boolean;
  mode: "send" | "cancelled";
  phase: typeof P260_PHASE;
  source: typeof P260_SOURCE;
  aborted: boolean;
  abortReason: string | null;
  candidateId: string;
  signatureRequestId: string | null;
  paperworkStatus: string | null;
  workflowStatus: string | null;
  idempotencyKey: string;
  preflight: P260ProductionPreflight;
  eligibility: P260Eligibility | null;
  verified: boolean;
  writes: {
    dropboxPacketCreated: boolean;
    workflowPaperworkSent: boolean;
  };
  auditTrail: P260AuditEntry[];
  detail: string;
};

export type P260RunInput = {
  candidateId: string;
  mode: "preview" | "send";
  confirmationPhrase?: string;
  /** Required when eligibility.requiresTypedConfirm — must equal P260_CONFIRMATION_PHRASE. */
  typedConfirmation?: string;
  nonstandardOverride?: boolean;
  manuallyRecovered?: boolean;
  byUserId?: string;
  /** Cancel before any write (tests / UI dismiss). */
  cancel?: boolean;
  allowNetworkGeocode?: boolean;
  /** Injected for tests. */
  deps?: P260RunDeps;
};

export type P260RunDeps = {
  preflight?: (confirmationPhrase: string) => Promise<P260ProductionPreflight>;
  refreshCandidate?: (candidateId: string) => Promise<P260CandidateSnapshot>;
  evaluateEligibility?: (
    snapshot: P260CandidateSnapshot,
    options?: { nonstandardOverride?: boolean },
  ) => P260Eligibility;
  executeSend?: (input: {
    candidateId: string;
    candidateName: string;
    candidateEmail: string;
    templateKey: string;
    byUserId: string;
    inFlightOnboardingId?: string;
  }) => Promise<{
    ok: boolean;
    signatureRequestId?: string;
    paperworkStatus?: string;
    workflowStatus?: string;
    error?: string;
    transient?: boolean;
  }>;
  prepareSend?: (candidateId: string, templateKey: string) => Promise<{ onboardingId: string }>;
  verifyDropbox?: (signatureRequestId: string) => Promise<boolean>;
  upsertPaperworkSent?: (input: {
    candidateId: string;
    signatureRequestId: string;
    byUserId: string;
  }) => Promise<void>;
  clearExpiredPacket?: (candidateId: string) => Promise<void>;
  acquireInFlight?: (idempotencyKey: string) => boolean;
  releaseInFlight?: (idempotencyKey: string) => void;
  checkExistingIdempotency?: (candidateId: string, email: string) => Promise<{
    blocked: boolean;
    reason: string | null;
  }>;
  recordIdempotency?: (input: {
    candidateId: string;
    email: string;
    signatureRequestId: string;
    idempotencyKey: string;
  }) => Promise<void>;
};
