/** P186.5 — Post-sign lifecycle advancement + MEL export queue (non-authoritative). */

export const P186_5_SOURCE_PHASE = "P186.5" as const;
export const P186_5_SCHEMA_VERSION = 5 as const;
export const P186_5_CHECKLIST_VERSION = "onboarding-checklist-v1";

export type P1865ProductRole =
  | "executive"
  | "operator"
  | "recruiter"
  | "dm"
  | "read_only_viewer";

export type P1865ReadinessState =
  | "paperwork_signed_complete"
  | "paperwork_signed_missing_documents"
  | "paperwork_signed_needs_review"
  | "paperwork_signed_conflicting_state"
  | "paperwork_not_signed"
  | "declined_or_canceled"
  | "duplicate_envelope_conflict"
  | "identity_unresolved"
  | "onboarding_assignment_invalid"
  | "ready_for_mel_review"
  | "mel_export_blocked"
  | "already_exported"
  | "no_action";

export type P1865QueueId =
  | "signed_ready_onboarding_validation"
  | "signed_missing_documents"
  | "signed_conflicting"
  | "ready_for_mel_review"
  | "mel_export_blocked"
  | "already_exported"
  | "post_sign_reconciliation_exceptions";

export type P1865MelQueueStatus =
  | "pending_review"
  | "approved_for_export"
  | "export_queued"
  | "export_in_progress"
  | "exported_unverified"
  | "confirmed_exported"
  | "blocked"
  | "failed"
  | "canceled";

/** Statuses P186.5 may create — never executes real MEL export. */
export const P1865_CREATABLE_MEL_STATUSES: readonly P1865MelQueueStatus[] = [
  "pending_review",
  "approved_for_export",
] as const;

export type P1865ChecklistRequirementId =
  | "signed_onboarding_agreement"
  | "i9_completion"
  | "tax_form_completion"
  | "direct_deposit_status"
  | "identification_document"
  | "client_specific_forms"
  | "state_specific_forms"
  | "worker_classification"
  | "policy_acknowledgments"
  | "training_acknowledgments";

export type P1865ChecklistItem = {
  requirementId: P1865ChecklistRequirementId;
  completionStatus: "complete" | "incomplete" | "not_applicable" | "unknown";
  source: string;
  verifiedAt: string | null;
  redactedReference: string | null;
  blockerReason: string | null;
};

export type P1865PostSignEvent = {
  eventId: string;
  candidateId: string | null;
  envelopeId: string | null;
  rolloutOrSendId: string | null;
  onboardingAssignmentId: string | null;
  jobOrProjectId: string | null;
  envelopeStatus: string | null;
  sourceSystem: string;
  at: string;
  templateKey: string | null;
  requiredSignersCompleted: boolean | null;
  requiredFieldsPresent: boolean | null;
  declinedOrCanceled: boolean;
  expiredOrFailed: boolean;
};

export type P1865SignedVerificationResult = {
  ok: boolean;
  blockers: string[];
  codes: string[];
};

export type P1865ReadinessClassification = {
  candidateId: string;
  state: P1865ReadinessState;
  productionState: string | null;
  shadowState: string | null;
  envelopeStatus: string | null;
  checklistCompletionPct: number;
  missingRequirements: string[];
  blockers: string[];
  recommendedAction: string;
  confidence: number;
  sourceTimestamps: Record<string, string | null>;
  queueId: P1865QueueId | null;
};

export type P1865MelQueueItem = {
  id: string;
  candidateId: string;
  jobOrProjectId: string | null;
  approvedProductionStateRef: string | null;
  approvalEventId: string | null;
  checklistVersion: string;
  readinessTimestamp: string;
  priority: "high" | "medium" | "low";
  retryCount: number;
  status: P1865MelQueueStatus;
  idempotencyKey: string;
  onboardingAssignmentId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type P1865MelExportPreview = {
  candidateIdHash: string;
  jobOrProjectId: string | null;
  workerClassification: string | null;
  recruiter: string | null;
  dm: string | null;
  requiredFieldReadinessPct: number;
  missingFields: string[];
  sourceSystemReferences: string[];
  proposedMelAction: string;
};

export type P1865ReconcileFinding = {
  candidateId: string;
  kind: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  detail: string;
  recommendedAction: string;
};

export type P1865OperatorAction =
  | "approve_onboarding_completion"
  | "reject_onboarding_completion"
  | "request_missing_documents"
  | "place_onboarding_hold"
  | "clear_onboarding_hold"
  | "approve_ready_for_mel"
  | "return_for_correction"
  | "acknowledge_exception"
  | "assign_investigation_owner"
  | "add_note"
  | "view";

export type P1865HealthMetrics = {
  signedAwaitingOnboardingReview: number;
  missingDocumentsOverThreshold: number;
  readyForMelAgingMs: { oldest: number | null; average: number | null };
  melExportBlockedAgingMs: { oldest: number | null; average: number | null };
  duplicateQueueConflicts: number;
  signedNotInProduction: number;
  exportedUnconfirmed: number;
  failedReconciliation: number;
  staleQueueItems: number;
};
