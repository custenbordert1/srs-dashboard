/** P186.7 — Controlled lifecycle cutover + legacy writer retirement (plan/readiness only). */

export {
  P186_7_SOURCE_PHASE,
  P186_7_SCHEMA_VERSION,
  P1867_IMPLEMENTED_MAX_STAGE,
  P1867_TRANSITIONS,
} from "@/lib/p186-7-lifecycle-cutover/types";
export type {
  P1867CutoverStage,
  P1867WriterControlStatus,
  P1867LifecycleTransition,
  P1867OwnershipRow,
  P1867WriterControlRecord,
  P1867GateResult,
  P1867ShadowParityReport,
  P1867CanaryPlan,
  P1867RollbackPlan,
  P1867RetirementItem,
} from "@/lib/p186-7-lifecycle-cutover/types";

export {
  readP1867Flags,
  hasGlobalAuthoritativeFlag,
  readShadowMatchThreshold,
} from "@/lib/p186-7-lifecycle-cutover/flags";
export type { P1867Flags } from "@/lib/p186-7-lifecycle-cutover/flags";

export {
  P1867_OWNERSHIP_MATRIX,
  getOwnershipRow,
  assertOwnershipCompleteness,
  buildArchitectureDoc,
} from "@/lib/p186-7-lifecycle-cutover/ownershipMatrix";

export {
  P1867_FREEZE_ORDER,
  WriterControlRegistry,
  createDefaultWriterControlRegistry,
} from "@/lib/p186-7-lifecycle-cutover/writerControlRegistry";

export {
  evaluateFreezeGates,
  requestWriterFreeze,
  classifyFreezeReadiness,
  getFreezeOrder,
} from "@/lib/p186-7-lifecycle-cutover/freezeControls";
export type { FreezeGateContext, FreezeEvaluation } from "@/lib/p186-7-lifecycle-cutover/freezeControls";

export {
  stageIndex,
  resolveAllowedStage,
  evaluateCutoverReadinessGates,
} from "@/lib/p186-7-lifecycle-cutover/cutoverStages";
export type { ReadinessInput } from "@/lib/p186-7-lifecycle-cutover/cutoverStages";

export {
  buildTransitionCanaryPlan,
  assertCanaryImmutable,
  simulateCanaryStopOnFailure,
  executeTransitionCanary,
  P1867_DEFAULT_CANARY_MAX,
} from "@/lib/p186-7-lifecycle-cutover/canaryFramework";

export {
  buildRollbackPlans,
  simulateRollbackRestoration,
  executeRollback,
  assertRollbackForbids,
} from "@/lib/p186-7-lifecycle-cutover/rollbackFramework";

export {
  buildSchedulerConsolidationPlan,
  assertSchedulerNotActivated,
} from "@/lib/p186-7-lifecycle-cutover/schedulerPlan";

export {
  buildShadowParityReport,
  shadowParityPassesThreshold,
  emptyShadowParityReport,
  fixtureShadowParityNearPerfect,
  fixtureShadowParityWithCritical,
} from "@/lib/p186-7-lifecycle-cutover/shadowParity";
export type { ShadowObservationRow } from "@/lib/p186-7-lifecycle-cutover/shadowParity";

export {
  buildRepositoryRetirementPlan,
  assertNothingDeleted,
} from "@/lib/p186-7-lifecycle-cutover/retirementPlan";

export {
  buildCutoverDashboard,
  buildCutoverValidationSummary,
} from "@/lib/p186-7-lifecycle-cutover/cutoverDashboard";
export type {
  P1867CutoverDashboard,
  BuildCutoverDashboardInput,
} from "@/lib/p186-7-lifecycle-cutover/cutoverDashboard";
