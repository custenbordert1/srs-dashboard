import { getDocument, putDocument, DOC_KEYS } from "@/lib/p185-5-vercel-durable-storage/adapter";
import { applyP1855Migrations } from "@/lib/p185-5-vercel-durable-storage/migrate";
import { createSqlClient, isP1855DurableConfigured } from "@/lib/p185-5-vercel-durable-storage/sqlClient";
import type { P184EngineStateFile } from "@/lib/p184-autonomous-paperwork-send-engine/types";
import { DEFAULT_P184_CONFIG } from "@/lib/p184-autonomous-paperwork-send-engine/types";
import { pruneSendTimestamps } from "@/lib/p184-autonomous-paperwork-send-engine/rateLimiter";
import type { P185RunnerStateFile } from "@/lib/p185-production-paperwork-automation-runner/types";
import { emptyP185RunnerState } from "@/lib/p185-production-paperwork-automation-runner/types";
import type { P1853RolloutStateFile } from "@/lib/p185-3-controlled-live-paperwork-rollout/types";
import { emptyP1853State } from "@/lib/p185-3-controlled-live-paperwork-rollout/types";
import { hashEnvelopeId } from "@/lib/p185-5-vercel-durable-storage/sqlClient";

export function shouldUseP1855DurableBackend(): boolean {
  return isP1855DurableConfigured();
}

function emptyP184(): P184EngineStateFile {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    config: { ...DEFAULT_P184_CONFIG, rateLimits: { ...DEFAULT_P184_CONFIG.rateLimits } },
    queue: [],
    sendTimestamps: [],
    completedIdempotencyKeys: [],
  };
}

export async function loadP184FromDurable(): Promise<P184EngineStateFile> {
  const db = await createSqlClient();
  await applyP1855Migrations(db);
  const doc = await getDocument(DOC_KEYS.p184State, db);
  if (!doc?.value || typeof doc.value !== "object") return emptyP184();
  return structuredClone(doc.value as P184EngineStateFile);
}

export async function saveP184ToDurable(state: P184EngineStateFile): Promise<P184EngineStateFile> {
  const db = await createSqlClient();
  await applyP1855Migrations(db);
  const next: P184EngineStateFile = {
    ...state,
    updatedAt: new Date().toISOString(),
    sendTimestamps: pruneSendTimestamps(state.sendTimestamps),
    completedIdempotencyKeys: state.completedIdempotencyKeys.slice(-5_000),
    queue: state.queue.slice(-2_000),
  };
  // Never flip to live via durable save path accidentally — caller controls config.
  await putDocument(DOC_KEYS.p184State, next, db);
  await db.query(
    `INSERT INTO p184_config (id, payload, updated_at) VALUES ('default', $1::jsonb, NOW())
     ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
    [JSON.stringify(next.config)],
  );
  // Sync queue rows for claim/index queries
  await db.transaction(async (tx) => {
    const ids = next.queue.map((q) => q.candidateId);
    if (ids.length === 0) {
      await tx.query("DELETE FROM p184_queue_items");
    } else {
      // Upsert each; delete removed
      for (const item of next.queue) {
        await tx.query(
          `INSERT INTO p184_queue_items (
             candidate_id, idempotency_key, status, payload, priority_composite,
             enqueued_at, next_attempt_at, envelope_id_hash, updated_at
           ) VALUES ($1,$2,$3,$4::jsonb,$5,$6::timestamptz,$7::timestamptz,$8,NOW())
           ON CONFLICT (candidate_id) DO UPDATE SET
             idempotency_key = EXCLUDED.idempotency_key,
             status = EXCLUDED.status,
             payload = EXCLUDED.payload,
             priority_composite = EXCLUDED.priority_composite,
             next_attempt_at = EXCLUDED.next_attempt_at,
             envelope_id_hash = EXCLUDED.envelope_id_hash,
             updated_at = NOW()`,
          [
            item.candidateId,
            item.idempotencyKey,
            item.status,
            JSON.stringify(item),
            item.priority?.composite ?? 0,
            item.enqueuedAt,
            item.nextAttemptAt,
            item.envelopeId ? hashEnvelopeId(item.envelopeId) : null,
          ],
        );
      }
      await tx.query(
        `DELETE FROM p184_queue_items WHERE NOT (candidate_id = ANY($1::text[]))`,
        [ids],
      );
    }
    for (const key of next.completedIdempotencyKeys) {
      await tx.query(
        `INSERT INTO p184_idempotency_keys (idempotency_key, candidate_id, completed)
         VALUES ($1, $2, TRUE)
         ON CONFLICT (idempotency_key) DO UPDATE SET completed = TRUE`,
        [key, key.split(":")[0] ?? "unknown"],
      );
    }
  });
  return structuredClone(next);
}

export async function loadP185FromDurable(): Promise<P185RunnerStateFile> {
  const db = await createSqlClient();
  await applyP1855Migrations(db);
  const doc = await getDocument(DOC_KEYS.p185State, db);
  if (!doc?.value || typeof doc.value !== "object") return emptyP185RunnerState();
  return structuredClone(doc.value as P185RunnerStateFile);
}

export async function saveP185ToDurable(state: P185RunnerStateFile): Promise<P185RunnerStateFile> {
  const db = await createSqlClient();
  await applyP1855Migrations(db);
  const next: P185RunnerStateFile = {
    ...state,
    schemaVersion: 1,
    recordVersion: state.recordVersion + 1,
    updatedAt: new Date().toISOString(),
    envelopes: state.envelopes.slice(-2_000),
    operations: state.operations.slice(-2_000),
    alerts: state.alerts.slice(-200),
  };
  await putDocument(DOC_KEYS.p185State, next, db);
  return structuredClone(next);
}

export async function casSaveP185ToDurable(
  expectedVersion: number,
  state: P185RunnerStateFile,
): Promise<P185RunnerStateFile | null> {
  const { compareAndSetDocument } = await import("@/lib/p185-5-vercel-durable-storage/adapter");
  const db = await createSqlClient();
  await applyP1855Migrations(db);
  const current = await getDocument(DOC_KEYS.p185State, db);
  const currentVersion =
    current && typeof (current.value as P185RunnerStateFile).recordVersion === "number"
      ? (current.value as P185RunnerStateFile).recordVersion
      : current?.version ?? 0;
  // Prefer document CAS version; also enforce recordVersion match
  if ((current?.value as P185RunnerStateFile | undefined)?.recordVersion !== expectedVersion) {
    return null;
  }
  const next: P185RunnerStateFile = {
    ...state,
    schemaVersion: 1,
    recordVersion: expectedVersion + 1,
    updatedAt: new Date().toISOString(),
  };
  const cas = await compareAndSetDocument(
    DOC_KEYS.p185State,
    current?.version ?? 0,
    next,
    db,
  );
  if (!cas) return null;
  void currentVersion;
  return structuredClone(next);
}

export async function loadP1853FromDurable(): Promise<P1853RolloutStateFile> {
  const db = await createSqlClient();
  await applyP1855Migrations(db);
  const doc = await getDocument(DOC_KEYS.p1853State, db);
  if (!doc?.value || typeof doc.value !== "object") return emptyP1853State();
  return structuredClone(doc.value as P1853RolloutStateFile);
}

export async function saveP1853ToDurable(
  state: P1853RolloutStateFile,
): Promise<P1853RolloutStateFile> {
  const db = await createSqlClient();
  await applyP1855Migrations(db);
  const next: P1853RolloutStateFile = {
    ...state,
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
  };
  await putDocument(DOC_KEYS.p1853State, next, db);
  return structuredClone(next);
}
