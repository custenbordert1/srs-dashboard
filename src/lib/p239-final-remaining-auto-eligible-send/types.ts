/**
 * P239 — Final Remaining Auto-Eligible Paperwork Send (max 7).
 *
 * Continuation of P238: only candidates deferred as `batch_full` in P238,
 * excluding prior P221 / P227 / P235 / P237 / P238 recipients.
 * Per-candidate abort + continue. Dropbox Sign testMode=true only.
 */

export const P239_PHASE = "P239" as const;
export const P239_SCHEMA_VERSION = 1 as const;
export const P239_APPROVED_BY = "Taylor Custenborder" as const;
export const P239_MAX_BATCH = 7 as const;
export const P239_REQUIRED_RECRUITER = "Taylor" as const;
export const P239_REQUIRED_START_STAGE = "Applied" as const;
export const P239_TARGET_PN_STAGE = "Paperwork Needed" as const;
export const P239_POST_SEND_STAGE = "Paperwork Sent" as const;
export const P239_REQUIRED_PAPERWORK_STATUS = "not_sent" as const;
export const P239_SENT_PAPERWORK_STATUS = "sent" as const;
export const P239_MIN_SEND_INTERVAL_MS = 15_000;
export const P239_SOURCE_PHASE = "p239_final_remaining_auto_eligible_send" as const;
export const P239_EXCLUDED_NAME = "Calvin Brown" as const;

export type P239Mode = "preview" | "live";

export type P239ModeAuthorization = {
  mode: P239Mode;
  approved: boolean;
  approvedBy: string | null;
  failures: string[];
};

export type P239CheckResult = {
  ok: boolean;
  failures: string[];
};

export type P239WorkflowSnapshot = Record<string, unknown> & {
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

export const P239_ALLOWED_CHANGED_FIELDS = new Set([
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
  "notes",
  "history",
  "nextActionNeeded",
  "lastActionAt",
  "updatedAt",
]);

export const P239_FORBIDDEN_CHANGED_FIELDS = new Set([
  "assignedRecruiter",
  "recruiterAssignmentSource",
  "recruiterAssignmentReason",
  "recruiterAssignmentConfidence",
  "recruiterAssignedAt",
  "recruiterOwnershipVersion",
  "recruitingActions",
]);

export type P239ExclusionReason =
  | "not_p238_batch_full"
  | "prior_batch_p221"
  | "prior_batch_p227"
  | "prior_batch_p235"
  | "prior_batch_p237"
  | "prior_batch_p238"
  | "calvin_brown_excluded"
  | "missing_ingestion"
  | "missing_workflow"
  | "terminal_or_archived"
  | "rejected_or_withdrawn"
  | "duplicate_identity"
  | "already_sent_or_signed"
  | "recruiter_not_taylor"
  | "stage_not_eligible"
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
  | "send_failed"
  | "pre_send_failed"
  | "dm_failed"
  | "promotion_failed"
  | "other";

export type P239DmResolution = {
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

export type P239ProximityResult = {
  nearestMiles: number | null;
  coverageTier: string;
  coverageKnown: boolean;
  hasActiveOpportunities: boolean;
  nearestWork: { city: string; state: string } | null;
  autoEligible: boolean;
  blockers: string[];
};

export type P239EvaluatedCandidate = {
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
  dm: P239DmResolution;
  proximity: P239ProximityResult | null;
  canPromoteP656: boolean;
  selected: boolean;
  exclusionReason: P239ExclusionReason | null;
  exclusionDetail: string | null;
};

export type P239SelectionResult = {
  phase: typeof P239_PHASE;
  generatedAt: string;
  p238BatchFullPoolSize: number;
  priorExcludedCount: number;
  priorExcluded: {
    p221: number;
    p227: number;
    p235: number;
    p237: number;
    p238: number;
  };
  evaluatedCount: number;
  selectedCount: number;
  eligibleCount: number;
  maxBatch: typeof P239_MAX_BATCH;
  selected: P239EvaluatedCandidate[];
  exclusions: Array<{
    candidateId: string;
    redactedCandidateId: string;
    displayName: string;
    appliedDate: string;
    reason: P239ExclusionReason;
    detail: string;
  }>;
  evaluatedNewestFirst: Array<{
    candidateId: string;
    redactedCandidateId: string;
    displayName: string;
    appliedDate: string;
    selected: boolean;
    exclusionReason: P239ExclusionReason | null;
  }>;
};

export type P239DmAssignmentRow = {
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

export type P239PromotionRow = {
  candidateId: string;
  redactedCandidateId: string;
  displayName: string;
  stageBefore: string;
  stageAfter: string;
  promoted: boolean;
  reason: string;
  failures: string[];
};

export type P239SendRow = {
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
  appliedDate: string;
  error: string | null;
  testMode: boolean;
};

export type P239SkippedRow = {
  candidateId: string;
  redactedCandidateId: string;
  displayName: string;
  appliedDate: string;
  reason: P239ExclusionReason;
  detail: string;
  phase: "selection" | "execution";
};

export type P239GlobalDiff = {
  phase: typeof P239_PHASE;
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

export type P239SideEffectAudit = {
  phase: typeof P239_PHASE;
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
  recoveryStoreUnchanged: boolean;
  geocodeCacheOnlyAuthoritativeAdditions: boolean;
  advancedBeyondPaperworkSent: 0;
  nonTargetWorkflowChanges: number;
  ok: boolean;
  details: string[];
};
