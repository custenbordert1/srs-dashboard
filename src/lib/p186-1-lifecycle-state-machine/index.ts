export {
  P186_1_SOURCE_PHASE,
  P186_1_SCHEMA_VERSION,
  P186_LIFECYCLE_STATES,
  P186_LIFECYCLE_STATE_LABEL,
  P186_HAPPY_PATH_ORDER,
} from "@/lib/p186-1-lifecycle-state-machine/types";
export type {
  P186LifecycleState,
  P186LifecycleRecord,
  P186AuditEntry,
  P186TransitionCommand,
  P186TransitionResult,
  P186ValidationResult,
  P186ShadowFinding,
  P186ShadowProjectionResult,
  P186LifecycleHealthReport,
  P186ProductionCandidateSnapshot,
} from "@/lib/p186-1-lifecycle-state-machine/types";

export {
  P186_LEGAL_TRANSITIONS,
  isLegalTransition,
  isForwardProgress,
  deriveExpectedLifecycleState,
  happyPathIndex,
} from "@/lib/p186-1-lifecycle-state-machine/states";

export { validateTransition } from "@/lib/p186-1-lifecycle-state-machine/transitionValidator";
export { LifecycleStateMachine } from "@/lib/p186-1-lifecycle-state-machine/lifecycleStateMachine";
export { LifecycleAuditStore, LifecycleRecordStore } from "@/lib/p186-1-lifecycle-state-machine/stores";
export { ShadowProjectionEngine, loadLatestShadowRun } from "@/lib/p186-1-lifecycle-state-machine/shadowProjection";
export { buildLifecycleHealthReport } from "@/lib/p186-1-lifecycle-state-machine/healthReport";
export { applyP1861Migrations, getP1861SchemaVersion } from "@/lib/p186-1-lifecycle-state-machine/migrate";
