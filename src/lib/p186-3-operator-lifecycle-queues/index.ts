/** P186.3 — Operator lifecycle queues (shadow-backed, non-authoritative). */

export {
  P186_3_SOURCE_PHASE,
  P186_3_SCHEMA_VERSION,
  P186_3_DEFAULT_BULK_LIMIT,
} from "@/lib/p186-3-operator-lifecycle-queues/types";
export type {
  P1863ProductRole,
  P1863QueueId,
  P1863QueueSummary,
  P1863CandidateQueueItem,
  P1863CandidateDetail,
  P1863OperatorAction,
  P1863BulkPreview,
  P1863ActionResult,
} from "@/lib/p186-3-operator-lifecycle-queues/types";

export { readP1863Flags, readBulkLimit } from "@/lib/p186-3-operator-lifecycle-queues/flags";
export type { P1863Flags } from "@/lib/p186-3-operator-lifecycle-queues/flags";

export {
  toProductRole,
  canViewQueue,
  canPerformAction,
  isProductionWriteAction,
  listAllowedActions,
} from "@/lib/p186-3-operator-lifecycle-queues/rbac";

export {
  classifyQueue,
  buildQueueItem,
  summarizeQueues,
  recommendedActionForQueue,
  P1863_QUEUE_LABELS,
} from "@/lib/p186-3-operator-lifecycle-queues/queues";
export type { P1863SourceRow } from "@/lib/p186-3-operator-lifecycle-queues/queues";

export { evaluateApprovalGates, expectedStatesForAction } from "@/lib/p186-3-operator-lifecycle-queues/gates";
export { executeOperatorApprovalAction } from "@/lib/p186-3-operator-lifecycle-queues/approvalActions";
export { previewBulkAction, executeBulkAction } from "@/lib/p186-3-operator-lifecycle-queues/bulkActions";
export { executeConflictReviewAction } from "@/lib/p186-3-operator-lifecycle-queues/conflictReview";
export { applyP1863Migrations, appendOperatorAudit, addOperatorNote } from "@/lib/p186-3-operator-lifecycle-queues/audit";
export {
  buildOperatorDashboard,
  buildCandidateDetail,
  buildRowsFromStores,
  workflowToSourceRow,
  buildHealthMetrics,
} from "@/lib/p186-3-operator-lifecycle-queues/dashboard";
export type {
  WorkflowLike,
  P1863DashboardSnapshot,
  P1863HealthMetrics,
} from "@/lib/p186-3-operator-lifecycle-queues/dashboard";
export { applyQueueFilters, sortQueueItems } from "@/lib/p186-3-operator-lifecycle-queues/filters";
export type { P1863QueueFilters } from "@/lib/p186-3-operator-lifecycle-queues/filters";
export { buildRedactedExport } from "@/lib/p186-3-operator-lifecycle-queues/export";
