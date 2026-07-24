/** P186.3 — Operator lifecycle queues (shadow-backed, non-authoritative). */

export const P186_3_SOURCE_PHASE = "P186.3" as const;
export const P186_3_SCHEMA_VERSION = 3 as const;
export const P186_3_DEFAULT_BULK_LIMIT = 25;

export type P1863ProductRole =
  | "executive"
  | "operator"
  | "recruiter"
  | "dm"
  | "read_only_viewer";

export type P1863QueueId =
  | "waiting_recruiter_review"
  | "hiring_recommendation_needed"
  | "waiting_operator_approval"
  | "approved_waiting_paperwork"
  | "paperwork_sent"
  | "paperwork_viewed"
  | "paperwork_signed"
  | "onboarding_incomplete"
  | "ready_for_mel"
  | "export_blocked"
  | "lifecycle_conflicts"
  | "missing_shadow";

export type P1863QueueSummary = {
  queueId: P1863QueueId;
  label: string;
  count: number;
  oldestAgeMs: number | null;
  averageAgeMs: number | null;
  blockedCount: number;
  priorityCount: number;
};

export type P1863CandidateQueueItem = {
  candidateId: string;
  displayName: string;
  jobTitle: string | null;
  city: string | null;
  state: string | null;
  recruiter: string | null;
  dm: string | null;
  productionState: string | null;
  shadowState: string | null;
  paperworkState: string | null;
  onboardingState: string | null;
  melReady: boolean;
  mismatch: boolean;
  mismatchKind: string | null;
  blocked: boolean;
  blockers: string[];
  priority: "high" | "medium" | "low";
  ageMs: number;
  sourceSystemState: string | null;
  recommendedAction: string;
  queueId: P1863QueueId;
};

export type P1863CandidateDetail = P1863CandidateQueueItem & {
  lifecycleHistory: Array<{ at: string; from: string | null; to: string; reason: string }>;
  latestSourceEvent: { eventType: string; sourceSystem: string; at: string } | null;
  selectionEvidence: string[];
  auditTrail: Array<{ at: string; actor: string; action: string; detail: string }>;
  missingInformation: string[];
};

export type P1863OperatorAction =
  | "view"
  | "filter_sort"
  | "export_redacted"
  | "assign_review_label"
  | "add_note"
  | "approve_hiring_recommendation"
  | "reject_hiring_recommendation"
  | "return_to_recruiter"
  | "place_hold"
  | "remove_hold"
  | "mark_paperwork_review_approved"
  | "mark_onboarding_exception_reviewed"
  | "mark_mel_ready_review_approved"
  | "acknowledge_conflict"
  | "request_reconciliation"
  | "assign_investigation_owner"
  | "mark_conflict_reviewed";

export type P1863ApprovalGateFailure = {
  code: string;
  message: string;
};

export type P1863BulkPreview = {
  action: P1863OperatorAction;
  requestedCount: number;
  eligible: Array<{ candidateId: string; reason: string }>;
  blocked: Array<{ candidateId: string; reason: string }>;
  batchLimit: number;
  truncated: boolean;
};

export type P1863ActionResult = {
  ok: boolean;
  action: P1863OperatorAction;
  correlationId: string;
  succeeded: string[];
  failed: Array<{ candidateId: string; reason: string }>;
  productionEventIds: string[];
  shadowObservationTriggered: boolean;
  detail: string;
};
