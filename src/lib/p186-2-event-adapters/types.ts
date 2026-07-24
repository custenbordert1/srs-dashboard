/** P186.2 — Normalized lifecycle events + shadow ingestion types. */

export const P186_2_SOURCE_PHASE = "P186.2" as const;
export const P186_2_SCHEMA_VERSION = 2 as const;
export const P186_2_PAYLOAD_VERSION = 1 as const;

export type P186EventSourceSystem =
  | "breezy"
  | "recruiter"
  | "operator"
  | "p184"
  | "p185"
  | "dropbox_sign"
  | "onboarding"
  | "mel"
  | "reconcile"
  | "synthetic"
  | "workflow_store";

export type P186LifecycleEventType =
  | "candidate_applied"
  | "breezy_stage_changed"
  | "recruiter_claimed"
  | "recruiter_recommended"
  | "recruiter_rejected"
  | "operator_approved"
  | "operator_denied"
  | "paperwork_needed"
  | "confirmed_sent"
  | "viewed"
  | "signed"
  | "declined"
  | "canceled"
  | "failed"
  | "onboarding_complete"
  | "ready_for_mel"
  | "mel_exported"
  | "reconcile_tick"
  | "unmapped";

export type P186NormalizedLifecycleEvent = {
  eventId: string;
  candidateId: string;
  eventType: P186LifecycleEventType;
  sourceSystem: P186EventSourceSystem;
  sourceTimestamp: string;
  receivedTimestamp: string;
  actor: string;
  correlationId: string;
  idempotencyKey: string;
  payloadVersion: number;
  /** Redacted operational metadata only — no emails/names/URLs. */
  redactedMetadata: Record<string, string | number | boolean | null>;
};

export type P186IngestDisposition =
  | "accepted"
  | "duplicate"
  | "rejected_malformed"
  | "rejected_flag_off"
  | "out_of_order"
  | "late"
  | "invalid_transition"
  | "impossible_transition"
  | "missing_predecessor"
  | "conflicting_source_state"
  | "unmapped"
  | "ingestion_failure"
  | "match"
  | "mismatch";

export type P186IngestResult = {
  disposition: P186IngestDisposition;
  event: P186NormalizedLifecycleEvent | null;
  shadowStateBefore: string | null;
  shadowStateAfter: string | null;
  productionDerivedState: string | null;
  comparison:
    | "match"
    | "mismatch"
    | "invalid_transition"
    | "duplicate"
    | "out_of_order"
    | "impossible_transition"
    | "missing_predecessor"
    | "conflicting_source_state"
    | "skipped"
    | null;
  detail: string;
  auditId: string | null;
};

export type P1862HealthReport = {
  phase: typeof P186_2_SOURCE_PHASE;
  generatedAt: string;
  flags: Record<string, boolean>;
  storage: { provider: string; healthy: boolean; durable: boolean };
  ingestion: {
    received: number;
    accepted: number;
    duplicates: number;
    invalid: number;
    outOfOrder: number;
    late: number;
    failures: number;
    unmapped: number;
  };
  shadow: {
    matches: number;
    mismatches: number;
    impossibleTransitions: number;
    conflictingSourceState: number;
  };
  reconciliation: {
    lastRunAt: string | null;
    findings: number;
    byKind: Record<string, number>;
  };
  sourceLag: Record<string, { lastEventAt: string | null; lagMs: number | null }>;
  isolation: {
    paperworkSendDisabled: true;
    continuousAutomationDisabled: true;
    liveModeNotEnabledByP186: true;
    p184P185Unmodified: true;
    authoritativeModeDisabled: true;
  };
  readyForP186_3: boolean;
  blockers: string[];
  warnings: string[];
};

export type P186ReconciliationFinding = {
  candidateId: string;
  kind:
    | "aligned"
    | "shadow_behind"
    | "shadow_ahead"
    | "source_conflict"
    | "missing_shadow"
    | "unmapped_production";
  breezyStage: string | null;
  workflowState: string | null;
  paperworkState: string | null;
  dropboxState: string | null;
  onboardingState: string | null;
  melReadyState: string | null;
  shadowState: string | null;
  detail: string;
};
