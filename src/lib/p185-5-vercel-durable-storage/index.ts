export {
  P185_5_SOURCE_PHASE,
  P185_5_SCHEMA_VERSION,
  P185_5_OPERATOR,
  DOC_KEYS,
} from "@/lib/p185-5-vercel-durable-storage/types";
export type * from "@/lib/p185-5-vercel-durable-storage/types";

export {
  createSqlClient,
  isP1855DurableConfigured,
  resolveDatabaseUrl,
  resolvePgliteDataDir,
  resetSqlClientCacheForTests,
  redactProviderName,
  stableHash,
  hashEnvelopeId,
} from "@/lib/p185-5-vercel-durable-storage/sqlClient";

export { applyP1855Migrations, getAppliedSchemaVersion } from "@/lib/p185-5-vercel-durable-storage/migrate";
export { migrateFrozenRolloutToDurableStore } from "@/lib/p185-5-vercel-durable-storage/migrateFromFs";
export {
  getDocument,
  putDocument,
  createDocumentIfAbsent,
  compareAndSetDocument,
  listDocumentsByPrefix,
  appendAuditEvent,
  claimQueueItem,
  acquireLease,
  heartbeatLease,
  releaseLease,
  createIdempotencyKeyDurable,
  markIdempotencyCompleted,
  upsertEnvelopeRecord,
  healthCheck,
} from "@/lib/p185-5-vercel-durable-storage/adapter";
export {
  runP1855DurabilityValidation,
  validationPassed,
} from "@/lib/p185-5-vercel-durable-storage/validation";
export { buildP1855HealthReport } from "@/lib/p185-5-vercel-durable-storage/health";
export {
  shouldUseP1855DurableBackend,
  loadP184FromDurable,
  saveP184ToDurable,
  loadP185FromDurable,
  saveP185ToDurable,
  loadP1853FromDurable,
  saveP1853ToDurable,
} from "@/lib/p185-5-vercel-durable-storage/bridges";

export { runP1855DurableStorageMigration } from "@/lib/p185-5-vercel-durable-storage/run";
