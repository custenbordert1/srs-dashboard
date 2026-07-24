export {
  P240_PHASE,
  P240_SCHEMA_VERSION,
  P240_EXECUTION_MODE,
  P240_SOURCE_PHASE,
  P240_DEFAULT_CUTOFF_ISO,
  P240_CUTOFF_SOURCE,
  P240_LOOKBACK_DAYS,
  P240_SIMULATION_HORIZON_HOURS,
  P240_MAX_PROXY_COHORT,
  P240_MIN_PROXY_COHORT,
} from "@/lib/p240-autonomous-new-applicant-pipeline/types";
export type {
  P240GoNoGo,
  P240QueueLocation,
  P240BlockerCode,
  P240SimOutcome,
  P240CohortKind,
  P240PipelineStep,
  P240CandidateTrace,
  P240BlockedCandidate,
  P240LiveDashboard,
  P240Throughput,
  P240PipelineHealth,
  P240CutoffResolution,
  P240ZeroWriteAudit,
  P240RunResult,
  P240FreshnessTrace,
} from "@/lib/p240-autonomous-new-applicant-pipeline/types";

export {
  p240Sha256,
  p240RedactId,
  p240NormalizeEmail,
  p240DisplayName,
  p240ParseMs,
  p240HasUsableEmail,
  p240HasUsablePhone,
  p240IsTerminalOrArchived,
  p240IsCalvinBrown,
  resolveP240Cutoff,
  loadP239SentCandidateIds,
  loadP240PriorSentExclusion,
} from "@/lib/p240-autonomous-new-applicant-pipeline/cohort";

export {
  simulateP240CandidatePath,
  selectP240Cohorts,
  buildP240RecruiterProposals,
  buildP240EmailOwners,
  applyP240FreshNewReplayReset,
  resetToFreshNewState,
  refreshBreezyCandidateData,
  validateP240FreshNewReset,
  hashP240FreshnessState,
  findLeftoverStaleFreshNewFields,
  P240_FRESH_NEW_REPLAY_ACTION_FIELDS,
  P240_FRESH_NEW_REPLAY_ASSIGNMENT_FIELDS,
  P240_FRESH_NEW_REPLAY_PACKET_FIELDS,
} from "@/lib/p240-autonomous-new-applicant-pipeline/simulate";
export type { P240OppPoint } from "@/lib/p240-autonomous-new-applicant-pipeline/simulate";
export type {
  P240FreshnessStateSnapshot,
  P240FreshnessValidation,
  RefreshBreezyCandidateResult,
} from "@/lib/p240-autonomous-new-applicant-pipeline/freshness";

export {
  buildP240BlockedList,
  buildP240LiveDashboard,
  buildP240Throughput,
  buildP240PipelineHealth,
} from "@/lib/p240-autonomous-new-applicant-pipeline/health";

export { formatP240AutonomousPipelineReport } from "@/lib/p240-autonomous-new-applicant-pipeline/format";

export { runP240AutonomousPipelineDryRun } from "@/lib/p240-autonomous-new-applicant-pipeline/run";
