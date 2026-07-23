/**
 * P235 — Controlled Newest-First DM Assignment and Paperwork Send (Maximum 5).
 *
 * Frozen cohort: P234 Taylor-assigned IDs only.
 * Pipeline: select newest → authoritative DM → proximity ≤39 → promote PN → Dropbox Sign (testMode).
 */

export const P235_PHASE = "P235" as const;
export const P235_SCHEMA_VERSION = 1 as const;
export const P235_APPROVED_BY = "Taylor Custenborder" as const;
export const P235_MAX_BATCH = 5 as const;
export const P235_REQUIRED_RECRUITER = "Taylor" as const;
export const P235_REQUIRED_START_STAGE = "Applied" as const;
export const P235_TARGET_PN_STAGE = "Paperwork Needed" as const;
export const P235_POST_SEND_STAGE = "Paperwork Sent" as const;
export const P235_REQUIRED_PAPERWORK_STATUS = "not_sent" as const;
export const P235_SENT_PAPERWORK_STATUS = "sent" as const;
export const P235_MIN_SEND_INTERVAL_MS = 15_000;
export const P235_SOURCE_PHASE = "p235_controlled_newest_five_send" as const;
export const P235_EXCLUDED_NAME = "Calvin Brown" as const;

export type P235Mode = "preview" | "live";

export type P235ModeAuthorization = {
  mode: P235Mode;
  approved: boolean;
  approvedBy: string | null;
  failures: string[];
};

export type P235CheckResult = {
  ok: boolean;
  failures: string[];
};

export type P235WorkflowSnapshot = Record<string, unknown> & {
  candidateId: string;
  workflowStatus: string;
  assignedRecruiter?: string;
  assignedDM?: string;
  paperworkStatus?: string;
  signatureRequestId?: string | null;
  paperworkSentAt?: string | null;
  notes?: string[];
  history?: Array<{ id?: string; type?: string; message?: string; createdAt?: string }>;
  updatedAt?: string;
  lastActionAt?: string | null;
  nextActionNeeded?: string;
  onboardingContactEmail?: string | null;
};

/** Fields allowed across the full P235 live pipeline (DM + promote + send). */
export const P235_ALLOWED_CHANGED_FIELDS = new Set([
  "assignedDM",
  "workflowStatus",
  "signatureRequestId",
  "paperworkStatus",
  "paperworkSentAt",
  "paperworkTemplateKey",
  "paperworkViewedAt",
  "paperworkViewCount",
  "paperworkSignedAt",
  "paperworkError",
  "onboardingContactEmail",
  "requiredAction",
  "actionType",
  "actionPriority",
  "actionReason",
  "actionDueDate",
  "actionConfidence",
  "actionGeneratedAt",
  /** P65.6 promotePaperworkFunnel appends one promotion note. */
  "notes",
  "history",
  "nextActionNeeded",
  "lastActionAt",
  "updatedAt",
]);

export const P235_FORBIDDEN_CHANGED_FIELDS = new Set([
  "assignedRecruiter",
  "recruiterAssignmentSource",
  "recruiterAssignmentReason",
  "recruiterAssignmentConfidence",
  "recruiterAssignedAt",
  "recruiterOwnershipVersion",
  "recruitingActions",
]);

export type P235ExclusionReason =
  | "not_in_p234_frozen_cohort"
  | "calvin_brown_excluded"
  | "ingestion_gap"
  | "terminal_or_archived"
  | "rejected_or_withdrawn"
  | "duplicate_identity"
  | "already_sent_or_signed"
  | "recruiter_not_taylor"
  | "stage_not_applied"
  | "missing_identity"
  | "missing_email"
  | "missing_phone"
  | "missing_position_id"
  | "position_location_not_authoritative"
  | "dm_unresolvable"
  | "dm_ambiguous"
  | "dm_conflict"
  | "qualification_gate_failed"
  | "manual_review_40_60"
  | "blocked_over_60"
  | "coverage_unknown"
  | "no_active_work"
  | "batch_full"
  | "other";

export type P235DmResolution = {
  ok: boolean;
  proposedAssignedDM: string | null;
  expectedDmFromRouting: string | null;
  routingState: string | null;
  positionId: string | null;
  positionCity: string | null;
  positionState: string | null;
  locationSource: string | null;
  authoritative: boolean;
  wouldChange: boolean;
  reason: string | null;
};

export type P235ProximityResult = {
  nearestMiles: number | null;
  coverageTier: string;
  coverageKnown: boolean;
  hasActiveOpportunities: boolean;
  nearestWork: { city: string; state: string } | null;
  autoEligible: boolean;
  blockers: string[];
};

export type P235EvaluatedCandidate = {
  candidateId: string;
  redactedCandidateId: string;
  displayName: string;
  email: string;
  phone: string;
  appliedDate: string;
  city: string;
  state: string;
  zip: string;
  positionId: string;
  positionName: string;
  assignedRecruiter: string;
  assignedDMBefore: string;
  workflowStage: string;
  paperworkStatus: string;
  signatureRequestId: string | null;
  dm: P235DmResolution;
  proximity: P235ProximityResult | null;
  canPromoteP656: boolean;
  selected: boolean;
  exclusionReason: P235ExclusionReason | null;
  exclusionDetail: string | null;
};

export type P235SelectionResult = {
  phase: typeof P235_PHASE;
  generatedAt: string;
  frozenCohortSize: number;
  evaluatedCount: number;
  selectedCount: number;
  maxBatch: typeof P235_MAX_BATCH;
  selected: P235EvaluatedCandidate[];
  exclusions: Array<{
    candidateId: string;
    redactedCandidateId: string;
    displayName: string;
    appliedDate: string;
    reason: P235ExclusionReason;
    detail: string;
  }>;
  evaluatedNewestFirst: Array<{
    candidateId: string;
    redactedCandidateId: string;
    displayName: string;
    appliedDate: string;
    selected: boolean;
    exclusionReason: P235ExclusionReason | null;
  }>;
};

export type P235DmAssignmentRow = {
  candidateId: string;
  redactedCandidateId: string;
  displayName: string;
  assignedDMBefore: string;
  assignedDMAfter: string;
  routingState: string | null;
  positionId: string | null;
  applied: boolean;
  verifyOk: boolean;
  failures: string[];
};

export type P235PromotionRow = {
  candidateId: string;
  redactedCandidateId: string;
  displayName: string;
  stageBefore: string;
  stageAfter: string;
  promoted: boolean;
  reason: string;
  failures: string[];
};

export type P235SendRow = {
  candidateId: string;
  redactedCandidateId: string;
  displayName: string;
  email: string;
  ok: boolean;
  signatureRequestId: string | null;
  paperworkStatus: string | null;
  stageBefore: string;
  stageAfter: string;
  paperworkBefore: string;
  paperworkAfter: string | null;
  assignedDM: string;
  assignedRecruiter: string;
  distanceMiles: number | null;
  coverageTier: string | null;
  error: string | null;
  testMode: boolean;
};

export type P235GlobalDiff = {
  phase: typeof P235_PHASE;
  generatedAt: string;
  targetIdsChanged: string[];
  nonTargetIdsChanged: string[];
  recordsAdded: string[];
  recordsRemoved: string[];
  fieldChangesById: Record<string, string[]>;
  targetOnly: boolean;
  targetCount: number;
  nonTargetCount: number;
};

export type P235SideEffectAudit = {
  phase: typeof P235_PHASE;
  generatedAt: string;
  paperworkRecipients: number;
  maxBatchHonored: boolean;
  dropboxSignRequestsCreated: number;
  duplicateSignatureRequests: number;
  testMode: boolean;
  melWrites: 0;
  breezyWrites: 0;
  recruiterChanges: 0;
  reminderEmails: 0;
  reminderJobs: 0;
  ingestionGapHandled: 0;
  recoveryStoreUnchanged: boolean;
  geocodeCacheOnlyAuthoritativeAdditions: boolean;
  advancedBeyondPaperworkSent: 0;
  nonTargetWorkflowChanges: number;
  ok: boolean;
  details: string[];
};
