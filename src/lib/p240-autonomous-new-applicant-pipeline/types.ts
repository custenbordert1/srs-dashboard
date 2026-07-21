/**
 * P240 — Autonomous New Applicant Pipeline (Continuous Mode).
 *
 * DRY RUN / PREVIEW ONLY. Detects NEW applicants after the P239 backlog-clear
 * cutoff and simulates Applied → Paperwork Sent without durable writes,
 * Dropbox Sign, stage changes, recruiter ownership changes, or DM writes.
 */

export const P240_PHASE = "P240" as const;
export const P240_SCHEMA_VERSION = 1 as const;
export const P240_EXECUTION_MODE = "dry_run_only" as const;
export const P240_SOURCE_PHASE = "p240_autonomous_new_applicant_pipeline" as const;

/** Frozen cutoff: P239 live send completion (backlog cleared). */
export const P240_DEFAULT_CUTOFF_ISO = "2026-07-20T21:06:46.975Z" as const;
export const P240_CUTOFF_SOURCE =
  "P239 final remaining auto-eligible send completion (artifacts/p239-sent.json generatedAt)" as const;

export const P240_LOOKBACK_DAYS = 14 as const;
export const P240_SIMULATION_HORIZON_HOURS = 24 as const;
export const P240_MAX_PROXY_COHORT = 40 as const;
export const P240_MIN_PROXY_COHORT = 5 as const;

export type P240GoNoGo = "GO" | "NO-GO" | "CONDITIONAL-GO";

export type P240QueueLocation =
  | "new_applicants_waiting"
  | "awaiting_recruiter"
  | "awaiting_qualification"
  | "awaiting_dm"
  | "paperwork_needed"
  | "sending"
  | "sent_today"
  | "failed_today"
  | "blocked"
  | "protected_already_sent"
  | "reached_paperwork_needed"
  | "would_send";

export type P240BlockerCode =
  | "not_ingested"
  | "missing_workflow"
  | "missing_identity"
  | "missing_email"
  | "missing_phone"
  | "missing_location"
  | "missing_position"
  | "awaiting_recruiter_assignment"
  | "recruiter_resolution_failed"
  | "manual_recruiter_override_protected"
  | "awaiting_qualification"
  | "qualification_gate_failed"
  | "awaiting_dm_assignment"
  | "dm_unresolvable"
  | "dm_ambiguous"
  | "position_location_not_authoritative"
  | "manual_review_40_60"
  | "blocked_over_60"
  | "coverage_unknown"
  | "no_active_work"
  | "duplicate_identity"
  | "already_sent_or_signed"
  | "prior_batch_sent"
  | "terminal_or_archived"
  | "operator_excluded"
  | "calvin_brown_excluded"
  | "stage_not_intake"
  | "recovery_protected";

export type P240SimOutcome =
  | "would_reach_paperwork_needed"
  | "would_send"
  | "blocked"
  | "protected_skip";

export type P240CohortKind = "real_new_post_cutoff" | "simulation_proxy_24h";

export type P240PipelineStep =
  | "ingested"
  | "recruiter_assigned"
  | "qualified"
  | "dm_assigned"
  | "proximity_ok"
  | "paperwork_needed"
  | "dropbox_sign_simulated"
  | "paperwork_sent_simulated";

/** Pre/post fresh-new reset hash validation surfaced on simulation traces. */
export type P240FreshnessTrace = {
  preResetHash: string | null;
  postResetHash: string | null;
  hashMismatch: boolean;
  leftoverStaleFields: string[];
  notes: string[];
  breezyRefreshSource: "breezy_enrichment" | "ingestion_cache" | "none" | "skipped" | null;
  breezyRefreshNote: string | null;
  /** True when resetToFreshNewState ran successfully for this candidate. */
  freshResetApplied: boolean;
};

export type P240CandidateTrace = {
  candidateId: string;
  redactedCandidateId: string;
  displayName: string;
  cohortKind: P240CohortKind;
  appliedDate: string | null;
  city: string;
  state: string;
  positionId: string;
  positionName: string;
  currentStage: string;
  paperworkStatus: string;
  assignedRecruiterBefore: string;
  assignedRecruiterSimulated: string | null;
  assignedDMBefore: string;
  assignedDMSimulated: string | null;
  nearestMiles: number | null;
  coverageTier: string | null;
  stepsCompleted: P240PipelineStep[];
  queueLocation: P240QueueLocation;
  outcome: P240SimOutcome;
  blocker: P240BlockerCode | null;
  blockerDetail: string | null;
  nextAction: string;
  estimatedMinutesAppliedToPaperwork: number | null;
  /** Present when replayAsFreshNew ran a full fresh-new reset + hash check. */
  freshness: P240FreshnessTrace | null;
  /** Operator-facing simulation notes (stale fields, refresh, soft warnings). */
  simulationNotes: string[];
};

export type P240BlockedCandidate = {
  candidateId: string;
  redactedCandidateId: string;
  displayName: string;
  cohortKind: P240CohortKind;
  appliedDate: string | null;
  queueLocation: P240QueueLocation;
  blocker: P240BlockerCode;
  blockerDetail: string;
  nextAction: string;
  assignedRecruiter: string;
  assignedDM: string;
  workflowStage: string;
};

export type P240LiveDashboard = {
  phase: typeof P240_PHASE;
  generatedAt: string;
  mode: typeof P240_EXECUTION_MODE;
  cutoffIso: string;
  cutoffSource: string;
  newApplicantsWaiting: number;
  awaitingRecruiter: number;
  awaitingQualification: number;
  awaitingDm: number;
  paperworkNeeded: number;
  sending: number;
  sentToday: number;
  failedToday: number;
  blockedCandidates: number;
  protectedAlreadySent: number;
  wouldReachPaperworkNeeded: number;
  wouldSend: number;
  realNewPostCutoff: number;
  simulationProxyCount: number;
  /** Proxy/replay candidates where fresh-new reset was applied. */
  freshResetApplied: number;
};

export type P240Throughput = {
  phase: typeof P240_PHASE;
  generatedAt: string;
  lookbackDays: number;
  simulationHorizonHours: number;
  arrivalsLast14Days: number;
  estimatedDailyArrivalRate: number;
  projectedArrivalsNext24h: number;
  proxyCohortSize: number;
  wouldReachPnCount: number;
  wouldSendCount: number;
  blockedCount: number;
  protectedSkipCount: number;
  autoClearRatePct: number;
  estimatedDailyThroughputToPn: number;
  estimatedDailyThroughputToSent: number;
  averageMinutesAppliedToPaperwork: number | null;
  averageHoursAppliedToPaperwork: number | null;
  bottleneckBreakdown: Array<{ blocker: P240BlockerCode; count: number; pct: number }>;
  /** Proxy traces that received resetToFreshNewState this run. */
  freshResetApplied: number;
};

export type P240PipelineHealth = {
  phase: typeof P240_PHASE;
  generatedAt: string;
  healthScore: number;
  grade: "A" | "B" | "C" | "D" | "F";
  factors: Array<{ name: string; score: number; weight: number; note: string }>;
  remainingBottlenecks: string[];
  goNoGo: P240GoNoGo;
  goNoGoReason: string;
  liveModeRecommendation: string;
  dryRunConfirmed: true;
  durableWrites: 0;
  dropboxSignCalls: 0;
  stageChanges: 0;
  recruiterOwnershipChanges: 0;
  dmAssignmentChanges: 0;
};

export type P240CutoffResolution = {
  cutoffIso: string;
  cutoffMs: number;
  source: string;
  p239GeneratedAt: string | null;
  maxP239AppliedDate: string | null;
};

export type P240ZeroWriteAudit = {
  phase: typeof P240_PHASE;
  mode: typeof P240_EXECUTION_MODE;
  generatedAt: string;
  before: Record<string, string>;
  after: Record<string, string>;
  unchanged: boolean;
  durablePaths: string[];
};

export type P240RunResult = {
  phase: typeof P240_PHASE;
  schemaVersion: typeof P240_SCHEMA_VERSION;
  mode: typeof P240_EXECUTION_MODE;
  generatedAt: string;
  cutoff: P240CutoffResolution;
  dashboard: P240LiveDashboard;
  throughput: P240Throughput;
  health: P240PipelineHealth;
  traces: P240CandidateTrace[];
  blocked: P240BlockedCandidate[];
  zeroWriteAudit: P240ZeroWriteAudit;
  testsRun: number;
  testsPassed: number;
  artifactPaths: string[];
};
