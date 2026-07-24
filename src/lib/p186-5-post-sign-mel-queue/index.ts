/** P186.5 — Post-sign lifecycle + MEL export queue (non-authoritative). */

export {
  P186_5_SOURCE_PHASE,
  P186_5_SCHEMA_VERSION,
  P186_5_CHECKLIST_VERSION,
  P1865_CREATABLE_MEL_STATUSES,
} from "@/lib/p186-5-post-sign-mel-queue/types";
export type * from "@/lib/p186-5-post-sign-mel-queue/types";

export { readP1865Flags, readMissingDocsAgeThresholdMs } from "@/lib/p186-5-post-sign-mel-queue/flags";
export type { P1865Flags } from "@/lib/p186-5-post-sign-mel-queue/flags";

export { resolvePostSignEvent } from "@/lib/p186-5-post-sign-mel-queue/postSignResolver";
export {
  verifySignedPaperwork,
  isSignedStatus,
  isViewedOrSentOnly,
} from "@/lib/p186-5-post-sign-mel-queue/signedVerification";
export { buildOnboardingChecklist } from "@/lib/p186-5-post-sign-mel-queue/checklist";
export type { ChecklistInput } from "@/lib/p186-5-post-sign-mel-queue/checklist";
export { classifyOnboardingReadiness } from "@/lib/p186-5-post-sign-mel-queue/classifier";
export {
  proposeShadowTransition,
  listAllowedShadowTransitions,
} from "@/lib/p186-5-post-sign-mel-queue/shadowProposals";
export {
  applyP1865Migrations,
  buildMelIdempotencyKey,
  enqueueMelExportItem,
  listMelQueue,
  appendP1865Audit,
  observeExternalMelExport,
} from "@/lib/p186-5-post-sign-mel-queue/melQueue";
export { buildMelExportPreview } from "@/lib/p186-5-post-sign-mel-queue/exportPreview";
export { executePostSignReviewAction } from "@/lib/p186-5-post-sign-mel-queue/reviewActions";
export {
  toP1865ProductRole,
  canViewP1865Queue,
  canPerformP1865Action,
} from "@/lib/p186-5-post-sign-mel-queue/rbac";
export { reconcilePostSignAndMel } from "@/lib/p186-5-post-sign-mel-queue/reconciliation";
export {
  P1865_QUEUE_LABELS,
  buildPostSignQueueItem,
  summarizePostSignQueues,
} from "@/lib/p186-5-post-sign-mel-queue/queues";
export { buildPostSignHealthMetrics } from "@/lib/p186-5-post-sign-mel-queue/health";
export { buildPostSignDashboard } from "@/lib/p186-5-post-sign-mel-queue/dashboard";
export type { PostSignCohortRow, P1865PostSignDashboard } from "@/lib/p186-5-post-sign-mel-queue/dashboard";
