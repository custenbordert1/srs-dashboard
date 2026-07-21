export const P243_SOURCE_PHASE = "P243" as const;
export const P243_SCHEMA_VERSION = 2 as const;

export type P243ExecutionMode = "dry_run" | "canary_live" | "full_live";

export type AutonomousCycleOptions = {
  /** Default true — zero Breezy / Dropbox / workflow durable writes from this cycle. */
  dryRun?: boolean;
  useLLMEnhancement?: boolean;
  limit?: number;
  positionIds?: string[];
  /** Required when dryRun=false for live paperwork execute path. */
  confirmLive?: boolean;
  /**
   * Canary live: process at most this many auto_advance sends even if limit is higher.
   * Default 3 when live. Ignored in dry-run.
   */
  canaryLimit?: number;
  /** Force full live (no canary cap). Requires confirmLive + dryRun=false. */
  fullLive?: boolean;
  byUserId?: string;
  batchId?: string;
  /** Skip candidates already recorded in the idempotency store. Default true. */
  respectIdempotency?: boolean;
  /** Prefer webhook inbox when available. Default true. */
  preferWebhooks?: boolean;
  /** Smart poll Breezy when webhook inbox is empty/stale. Default true. */
  enableSmartPoll?: boolean;
  /**
   * Replay/debug: apply in-memory fresh-new workflow reset + read-only Breezy
   * profile refresh before scoring. Never writes durable ingestion/workflow.
   * Default false.
   */
  forceFreshReset?: boolean;
  /**
   * @deprecated Use {@link AutonomousCycleOptions.forceFreshReset}. Kept for
   * backward compatibility — treated as an alias of forceFreshReset.
   */
  forceFreshData?: boolean;
  /**
   * Dangerous: treat P204 `human_review` as `auto_advance` for paperwork send.
   * Requires dryRun=false + confirmLive=true. Still respects canary, idempotency,
   * already-sent, state-machine, and Dropbox preflight. Default false.
   */
  forceAutoAdvance?: boolean;
  /**
   * P122 confirmation phrase required by P123 safety gates for live execute.
   * Open-stores / CLI auto-inject `SEND 1 PAPERWORK PACKET` when --live --confirm-live.
   */
  confirmationPhrase?: string;
};

export type AutonomousCandidateOutcome =
  | "auto_advance"
  | "human_review"
  | "auto_reject"
  | "skipped_idempotent"
  | "skipped_already_sent"
  | "skipped_state_machine"
  | "skipped_canary_cap"
  | "skipped_filter"
  | "error";

export type AutonomousCandidateResult = {
  candidateId: string;
  redactedCandidateId: string;
  name: string;
  /** Candidate email when available from workflow/ingestion (may be null). */
  email: string | null;
  positionId: string | null;
  appliedAt: string | null;
  outcome: AutonomousCandidateOutcome;
  p204Recommendation: string | null;
  confidence: number | null;
  paperworkTasksPlanned: number;
  paperworkExecuted: boolean;
  breezyStageUpdatePlanned: boolean;
  breezyStageUpdated: boolean;
  skipReason: string | null;
  error: string | null;
  ceoTraceId: string | null;
  /**
   * True when this candidate was originally human_review but forceAutoAdvance
   * overrode the decision to auto_advance for paperwork.
   */
  forcedAutoAdvance?: boolean;
};

export type P243PreflightCheck = {
  id: string;
  ok: boolean;
  message: string;
};

export type P243FailureReasonCount = {
  reason: string;
  count: number;
};

export type AutonomousCycleReport = {
  sourcePhase: typeof P243_SOURCE_PHASE;
  schemaVersion: typeof P243_SCHEMA_VERSION;
  generatedAt: string;
  dryRun: boolean;
  executionMode: P243ExecutionMode;
  useLLMEnhancement: boolean;
  /** True when forceAutoAdvance was active for this cycle (live + confirmLive). */
  forceAutoAdvanceEnabled: boolean;
  /** Count of human_review decisions overridden to auto_advance. */
  forcedAutoAdvanceCount: number;
  batchId: string;
  ceoTraceId: string;
  pulled: number;
  scored: number;
  autoAdvance: number;
  humanReview: number;
  autoReject: number;
  skippedIdempotent: number;
  skippedAlreadySent: number;
  skippedStateMachine: number;
  skippedCanaryCap: number;
  paperworkPlanned: number;
  paperworkSent: number;
  breezyStageUpdatesPlanned: number;
  breezyStageUpdatesApplied: number;
  failures: number;
  averageLatencyMs: number;
  /** 0–100 */
  advanceRatePct: number;
  /** 0–100 */
  successRatePct: number;
  reviewQueueDepth: number;
  commonFailureReasons: P243FailureReasonCount[];
  warnings: string[];
  preflight: P243PreflightCheck[];
  ingestion: {
    source: "webhook" | "smart_poll" | "durable_only" | "mixed";
    webhookHits: number;
    pollHits: number;
    deduped: number;
    lastCheckedAt: string | null;
    notes: string[];
  };
  candidates: AutonomousCandidateResult[];
  failuresDetail: Array<{ candidateId: string; error: string }>;
  notes: string[];
  idempotencyStorePath: string;
  /** Candidates that received an in-memory fresh-new reset this cycle. */
  freshResetApplied: number;
  auditTraceLinks: {
    ceoTraceId: string;
    batchId: string;
    evaluationPreviewPath: string;
  };
};
