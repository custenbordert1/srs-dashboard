export const P214_PHASE = "P214" as const;
export const P214_NOTE_MARKER = "[P214_UNSENT_TEST_BATCH]" as const;

export const P214_MAX_COHORT_SIZE = 20;
export const P214_BATCH_SIZE = 5;
/** ≤ 4 requests/minute. */
export const P214_MIN_SEND_INTERVAL_MS = 15_000;

/** Stages authorized for onboarding paperwork in this batch. */
export const P214_AUTHORIZED_STAGES = new Set(["Paperwork Needed"]);

export const P214_TIER1_MAX_MILES = 20;
export const P214_TIER2_MAX_MILES = 39;
export const P214_REVIEW_MAX_MILES = 60;

export type P214Classification =
  | "UNSENT_CONFIRMED"
  | "signed"
  | "viewed"
  | "pending_envelope"
  | "previously_sent_workflow"
  | "prior_cohort_member"
  | "duplicate_identity"
  | "already_placed"
  | "missing_contact_info"
  | "stage_not_authorized"
  | "blocked_no_active_work"
  | "blocked_over_60_miles"
  | "manual_review_40_60_miles"
  | "blocked_coverage_unknown"
  | "blocked_dm_unassigned"
  | "blocked_dm_wrong"
  | "blocked_non_geographic_posting";

/** Everything known about one candidate's prior-send history and routing. */
export type P214CandidateEvidence = {
  candidateId: string;
  normalizedEmail: string;
  hasName: boolean;
  workflowStatus: string;
  paperworkStatus: string;
  hasSignatureRequestId: boolean;
  hasPaperworkSentAt: boolean;
  /** Live Dropbox status for this signer email: null when no envelope exists. */
  dropboxEnvelopeStatus:
    | "complete"
    | "declined"
    | "cancelled"
    | "expired"
    | "viewed"
    | "partially_signed"
    | "pending"
    | null;
  /** Member of P185 / P208 / P100 / P104 / P184 or any operator send ledger. */
  inPriorSendLedger: boolean;
  /** Another applicant record with the same identity was kept instead. */
  isDuplicateIdentity: boolean;
  /** Email appears as assigned staff on active MEL work. */
  alreadyPlaced: boolean;
  /** Active onboarding record already carries an envelope. */
  hasActiveOnboardingEnvelope: boolean;
};

export type P214GateEvidence = {
  /** Straight-line miles to nearest active unassigned MEL opportunity. */
  nearestActiveWorkMiles: number | null;
  hasActiveOpportunities: boolean;
  coverageKnown: boolean;
  assignedDm: string;
  expectedDm: string;
  jobCity: string;
  jobState: string;
  /** True when the market was independently verified by an operator. */
  marketIndependentlyVerified?: boolean;
};

export type P214CoverageTier = "tier1_0_20" | "tier2_21_39" | "review_40_60" | "out_of_range";

export type P214CohortMember = {
  candidateId: string;
  redactedCandidateId: string;
  emailHash: string;
  positionLabel: string;
  workflowStatusAtFreeze: string;
  coverageTier: P214CoverageTier;
  nearestActiveWorkMiles: number;
  assignedDm: string;
  approvedAt: string;
  idempotencyKey: string;
};

export type P214FrozenCohort = {
  phase: typeof P214_PHASE;
  cohortId: string;
  fingerprint: string;
  authorizedAt: string;
  expiresAt: string;
  authorizedBy: string;
  sendMode: "test_mode";
  maxCohortSize: typeof P214_MAX_COHORT_SIZE;
  members: P214CohortMember[];
};

export type P214PreflightInput = {
  configPresent: boolean;
  testModeVerified: boolean;
  nodeEnvIsProduction: boolean;
  dropboxApiReachable: boolean;
  templateConfigured: boolean;
  templateFoundInAccount: boolean;
  signerRoleValid: boolean;
  cohortSize: number;
  membersWithNewEnvelopeSincePreview: number;
  duplicateIdempotencyKeys: number;
  continuousAutomationActive: boolean;
};

export type P214PreflightResult = {
  ok: boolean;
  failures: string[];
};

export type P214SendAttempt = {
  candidateId: string;
  redactedCandidateId: string;
  ok: boolean;
  status:
    | "confirmed_test_sent"
    | "skipped_existing_envelope"
    | "skipped_missing_workflow"
    | "skipped_missing_contact"
    | "send_failed";
  batch: number;
  idempotencyKey: string;
  envelopeId: string | null;
  testModeRequested: true;
  testModeVerified: boolean | null;
  dropboxStatus: string | null;
  signerEmailMatch: boolean | null;
  detail: string;
  at: string;
};

export type P214MonitorSummary = {
  attempted: number;
  confirmed: number;
  failed: number;
  skipped: number;
  duplicatePrevented: number;
  existingEnvelopeDiscovered: number;
  viewed: number;
  signedOrComplete: number;
  requestIdsPresent: number;
  testModeVerifiedCount: number;
  candidatesOutsideCohortTouched: 0;
};
