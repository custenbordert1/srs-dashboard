export { P186_2_SOURCE_PHASE, P186_2_SCHEMA_VERSION, P186_2_PAYLOAD_VERSION } from "@/lib/p186-2-event-adapters/types";
export type {
  P186NormalizedLifecycleEvent,
  P186LifecycleEventType,
  P186EventSourceSystem,
  P186IngestResult,
  P1862HealthReport,
  P186ReconciliationFinding,
} from "@/lib/p186-2-event-adapters/types";

export { readP1862Flags, isAdapterEnabled } from "@/lib/p186-2-event-adapters/flags";
export type { P1862Flags } from "@/lib/p186-2-event-adapters/flags";
export { normalizeLifecycleEvent, targetStateForEvent } from "@/lib/p186-2-event-adapters/normalize";
export {
  adaptBreezyStageChange,
  adaptRecruiterAction,
  adaptOperatorApproval,
  adaptPaperworkEngineEvent,
  adaptDropboxSignStatus,
  adaptOnboardingComplete,
  adaptReadyForMel,
  adaptMelExported,
  adaptReconcileTick,
  adaptWorkflowStoreChange,
} from "@/lib/p186-2-event-adapters/adapters";
export { ShadowDualWriteIngestor, hashOpaqueId } from "@/lib/p186-2-event-adapters/ingest";
export { runShadowReconciliation } from "@/lib/p186-2-event-adapters/reconciliation";
export { buildP1862HealthReport } from "@/lib/p186-2-event-adapters/health";
export {
  observeShadowEventSafe,
  observeDropboxSignWebhookSafe,
  observeWorkflowUpsertSafe,
} from "@/lib/p186-2-event-adapters/observe";
export { applyP1862Migrations } from "@/lib/p186-2-event-adapters/migrate";
