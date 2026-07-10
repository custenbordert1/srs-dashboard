export {
  P185_3_SOURCE_PHASE,
  P185_3_OPERATOR,
  emptyP1853State,
  hashEmail,
  hashEnvelopeId,
  newRolloutIds,
} from "@/lib/p185-3-controlled-live-paperwork-rollout/types";
export type * from "@/lib/p185-3-controlled-live-paperwork-rollout/types";

export {
  loadP1853State,
  saveP1853State,
  resetP1853StateMemoryForTests,
} from "@/lib/p185-3-controlled-live-paperwork-rollout/store";

export {
  freezeP1853Cohort,
  assertCandidateInFrozenCohort,
  blockCohortMember,
  tryAddCohortMember,
} from "@/lib/p185-3-controlled-live-paperwork-rollout/freeze";

export {
  evaluateP1853LiveGates,
  evaluateP1853LiveGatesAsync,
  canaryExecutionAllowed,
} from "@/lib/p185-3-controlled-live-paperwork-rollout/gates";

export {
  runP1853FinalCohortDryRun,
  buildP1853ReadinessReport,
} from "@/lib/p185-3-controlled-live-paperwork-rollout/readiness";

export { executeP1853Canary } from "@/lib/p185-3-controlled-live-paperwork-rollout/canary";
export type { P1853CanaryResult } from "@/lib/p185-3-controlled-live-paperwork-rollout/canary";

export { executeP1853BacklogCycle } from "@/lib/p185-3-controlled-live-paperwork-rollout/backlog";
export type { P1853BacklogCycleResult } from "@/lib/p185-3-controlled-live-paperwork-rollout/backlog";

export {
  executeP1853OperatorAction,
  getP1853DashboardSnapshot,
} from "@/lib/p185-3-controlled-live-paperwork-rollout/operator";
export type { P1853OperatorAction } from "@/lib/p185-3-controlled-live-paperwork-rollout/operator";

export { formatP1853ReadinessMarkdown } from "@/lib/p185-3-controlled-live-paperwork-rollout/report";

export {
  CANARY_MAX_SENDS,
  CANARY_MAX_CONCURRENT,
  CANARY_PERMANENT_FAILURE_LIMIT,
  CANARY_TRANSIENT_FAILURE_LIMIT,
  BACKLOG_MAX_SENDS_PER_CYCLE,
  BACKLOG_MAX_CONCURRENT,
  BACKLOG_FAILURES_PER_CYCLE,
  APPROVED_COHORT_SIZE,
  rejectCohortExpansion,
  selectSendableCohortMembers,
  evaluateCanaryPassCriteria,
  shouldResendAfterReconciliationFailure,
  paperworkWorkflowAfterConfirmedSend,
  paperworkWorkflowAfterSigned,
} from "@/lib/p185-3-controlled-live-paperwork-rollout/limits";

export {
  buildP1853PublicSummary,
  buildP1853ReconciliationSummary,
  writeP1853OperatorLocalReport,
  writeP1853PublicArtifacts,
} from "@/lib/p185-3-controlled-live-paperwork-rollout/artifacts";
