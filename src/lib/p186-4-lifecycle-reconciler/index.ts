/** P186.4 — Single lifecycle reconciler + duplicate-writer freeze (shadow-only). */

export { P186_4_SOURCE_PHASE, P186_4_SCHEMA_VERSION } from "@/lib/p186-4-lifecycle-reconciler/types";
export type {
  P1864WriterRecord,
  P1864SchedulerRecord,
  P1864ConflictFinding,
  P1864ReconcileFinding,
  P1864ReconcileSourceSnapshot,
  P1864FreezePlanItem,
  P1864ConflictDashboard,
  P1864FindingKind,
  P1864Severity,
} from "@/lib/p186-4-lifecycle-reconciler/types";

export { readP1864Flags } from "@/lib/p186-4-lifecycle-reconciler/flags";
export type { P1864Flags } from "@/lib/p186-4-lifecycle-reconciler/flags";

export {
  P1864_WRITER_REGISTRY,
  P1864_SCHEDULER_REGISTRY,
  REQUIRED_INVENTORY_WRITER_IDS,
  getWriterById,
  listWritersByConflictGroup,
} from "@/lib/p186-4-lifecycle-reconciler/writerRegistry";

export {
  buildOwnershipMatrix,
  detectDuplicateWriters,
  detectMissingIdempotency,
  detectMissingAudit,
  detectDirectMutations,
  detectStaleLegacyWriters,
  detectUnclearOwnership,
  runWriterConflictDetection,
} from "@/lib/p186-4-lifecycle-reconciler/detectors";

export {
  detectSchedulerOverlaps,
  recommendLifecycleReconciliationCadence,
  buildSchedulerCollisionReport,
} from "@/lib/p186-4-lifecycle-reconciler/schedulerCollision";

export {
  reconcileCandidateSources,
  assignSeverity,
  runShadowLifecycleReconciler,
} from "@/lib/p186-4-lifecycle-reconciler/reconciler";

export {
  buildFreezePlan,
  buildRollbackPlanSummary,
  recommendedFreezeOrder,
} from "@/lib/p186-4-lifecycle-reconciler/freezePlan";

export {
  buildConflictDashboard,
  buildWriterInventoryReport,
} from "@/lib/p186-4-lifecycle-reconciler/conflictDashboard";
