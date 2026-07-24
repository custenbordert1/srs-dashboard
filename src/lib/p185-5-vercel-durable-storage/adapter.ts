import { createSqlClient, hashEnvelopeId, stableHash } from "@/lib/p185-5-vercel-durable-storage/sqlClient";
import { applyP1855Migrations } from "@/lib/p185-5-vercel-durable-storage/migrate";
import {
  DOC_KEYS,
  type DurableDocument,
  type LeaseRow,
  type QueueClaimResult,
  type SqlClient,
} from "@/lib/p185-5-vercel-durable-storage/types";

export async function getDocument(
  key: string,
  client?: SqlClient,
): Promise<DurableDocument | null> {
  const db = client ?? (await createSqlClient());
  const result = await db.query(
    "SELECT doc_key, payload, version, checksum, updated_at FROM p1855_documents WHERE doc_key = $1",
    [key],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    key: String(row.doc_key),
    value: row.payload,
    version: Number(row.version),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
    checksum: String(row.checksum),
  };
}

export async function putDocument(
  key: string,
  value: unknown,
  client?: SqlClient,
): Promise<DurableDocument> {
  const db = client ?? (await createSqlClient());
  const checksum = stableHash(value);
  const result = await db.query(
    `INSERT INTO p1855_documents (doc_key, payload, version, checksum, updated_at)
     VALUES ($1, $2::jsonb, 1, $3, NOW())
     ON CONFLICT (doc_key) DO UPDATE SET
       payload = EXCLUDED.payload,
       version = p1855_documents.version + 1,
       checksum = EXCLUDED.checksum,
       updated_at = NOW()
     RETURNING doc_key, payload, version, checksum, updated_at`,
    [key, JSON.stringify(value), checksum],
  );
  const row = result.rows[0]!;
  return {
    key: String(row.doc_key),
    value: row.payload,
    version: Number(row.version),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
    checksum: String(row.checksum),
  };
}

/** Create document only if absent. Returns null if already exists. */
export async function createDocumentIfAbsent(
  key: string,
  value: unknown,
  client?: SqlClient,
): Promise<DurableDocument | null> {
  const db = client ?? (await createSqlClient());
  const checksum = stableHash(value);
  const result = await db.query(
    `INSERT INTO p1855_documents (doc_key, payload, version, checksum, updated_at)
     VALUES ($1, $2::jsonb, 1, $3, NOW())
     ON CONFLICT (doc_key) DO NOTHING
     RETURNING doc_key, payload, version, checksum, updated_at`,
    [key, JSON.stringify(value), checksum],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    key: String(row.doc_key),
    value: row.payload,
    version: Number(row.version),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
    checksum: String(row.checksum),
  };
}

/** Compare-and-set by document version. */
export async function compareAndSetDocument(
  key: string,
  expectedVersion: number,
  value: unknown,
  client?: SqlClient,
): Promise<DurableDocument | null> {
  const db = client ?? (await createSqlClient());
  const checksum = stableHash(value);
  const result = await db.query(
    `UPDATE p1855_documents
     SET payload = $3::jsonb,
         version = version + 1,
         checksum = $4,
         updated_at = NOW()
     WHERE doc_key = $1 AND version = $2
     RETURNING doc_key, payload, version, checksum, updated_at`,
    [key, expectedVersion, JSON.stringify(value), checksum],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    key: String(row.doc_key),
    value: row.payload,
    version: Number(row.version),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
    checksum: String(row.checksum),
  };
}

export async function listDocumentsByPrefix(
  prefix: string,
  client?: SqlClient,
): Promise<DurableDocument[]> {
  const db = client ?? (await createSqlClient());
  const result = await db.query(
    `SELECT doc_key, payload, version, checksum, updated_at
     FROM p1855_documents
     WHERE doc_key LIKE $1
     ORDER BY doc_key`,
    [`${prefix}%`],
  );
  return result.rows.map((row) => ({
    key: String(row.doc_key),
    value: row.payload,
    version: Number(row.version),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
    checksum: String(row.checksum),
  }));
}

export async function appendAuditEvent(input: {
  actor: string;
  action: string;
  candidateId?: string | null;
  rolloutId?: string | null;
  detail?: Record<string, unknown>;
  client?: SqlClient;
}): Promise<void> {
  const db = input.client ?? (await createSqlClient());
  await db.query(
    `INSERT INTO p185_audit_events (actor, action, candidate_id, rollout_id, detail)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [
      input.actor,
      input.action,
      input.candidateId ?? null,
      input.rolloutId ?? null,
      JSON.stringify(input.detail ?? {}),
    ],
  );
}

/**
 * Atomic queue claim + idempotency key creation.
 * Prevents two instances from claiming the same candidate.
 */
export async function claimQueueItem(input: {
  candidateId: string;
  claimantId: string;
  claimTtlMs?: number;
  client?: SqlClient;
}): Promise<QueueClaimResult> {
  const db = input.client ?? (await createSqlClient());
  const ttlMs = input.claimTtlMs ?? 120_000;
  try {
    return await db.transaction(async (tx) => {
      const existingIdem = await tx.query(
        `SELECT idempotency_key, completed FROM p184_idempotency_keys
         WHERE candidate_id = $1 AND completed = TRUE
         LIMIT 1`,
        [input.candidateId],
      );
      if (existingIdem.rowCount > 0) {
        return { claimed: false, reason: "Idempotency key already completed." };
      }

      const unverified = await tx.query(
        `SELECT state FROM p185_envelopes
         WHERE candidate_id = $1 AND state IN ('sent_unverified','confirmed_sent','viewed','signed')
         LIMIT 1`,
        [input.candidateId],
      );
      if (unverified.rowCount > 0) {
        return { claimed: false, reason: "Active or completed envelope exists — no resend." };
      }

      const claimExpires = new Date(Date.now() + ttlMs).toISOString();
      const claimed = await tx.query(
        `UPDATE p184_queue_items
         SET status = 'sending',
             claimed_by = $2,
             claim_expires_at = $3::timestamptz,
             updated_at = NOW()
         WHERE candidate_id = $1
           AND status IN ('queued', 'failed_transient')
           AND (claimed_by IS NULL OR claim_expires_at IS NULL OR claim_expires_at < NOW())
         RETURNING candidate_id, idempotency_key, payload`,
        [input.candidateId, input.claimantId, claimExpires],
      );
      const row = claimed.rows[0];
      if (!row) {
        return { claimed: false, reason: "Queue item unavailable or already claimed." };
      }

      const idempotencyKey = String(row.idempotency_key);
      const idem = await tx.query(
        `INSERT INTO p184_idempotency_keys (idempotency_key, candidate_id, completed)
         VALUES ($1, $2, FALSE)
         ON CONFLICT (idempotency_key) DO NOTHING
         RETURNING idempotency_key`,
        [idempotencyKey, input.candidateId],
      );
      if (idem.rowCount === 0) {
        // Abort so the queue UPDATE rolls back inside the transaction.
        throw new Error("P1855_IDEMPOTENCY_CONFLICT");
      }

      return {
        claimed: true,
        candidateId: String(row.candidate_id),
        idempotencyKey,
        item: (row.payload as Record<string, unknown>) ?? {},
      };
    });
  } catch (err) {
    if (err instanceof Error && err.message === "P1855_IDEMPOTENCY_CONFLICT") {
      return { claimed: false, reason: "Idempotency key conflict — duplicate claim prevented." };
    }
    throw err;
  }
}

export async function acquireLease(input: {
  leaseKey?: string;
  ownerId: string;
  cycleId: string;
  ttlMs: number;
  client?: SqlClient;
}): Promise<{ acquired: true; lease: LeaseRow } | { acquired: false; reason: string; active: LeaseRow | null }> {
  const db = input.client ?? (await createSqlClient());
  const leaseKey = input.leaseKey ?? "p185:runner";
  return db.transaction(async (tx) => {
    const current = await tx.query(
      `SELECT lease_key, owner_id, cycle_id, acquired_at, expires_at, heartbeat_at, version
       FROM p185_leases WHERE lease_key = $1 FOR UPDATE`,
      [leaseKey],
    );
    const row = current.rows[0];
    if (row && new Date(String(row.expires_at)).getTime() > Date.now()) {
      return {
        acquired: false,
        reason: "Lease held by another runner.",
        active: mapLease(row),
      };
    }
    const version = row ? Number(row.version) + 1 : 1;
    const now = new Date();
    const expires = new Date(now.getTime() + input.ttlMs);
    await tx.query(
      `INSERT INTO p185_leases (lease_key, owner_id, cycle_id, acquired_at, expires_at, heartbeat_at, version)
       VALUES ($1,$2,$3,$4,$5,$4,$6)
       ON CONFLICT (lease_key) DO UPDATE SET
         owner_id = EXCLUDED.owner_id,
         cycle_id = EXCLUDED.cycle_id,
         acquired_at = EXCLUDED.acquired_at,
         expires_at = EXCLUDED.expires_at,
         heartbeat_at = EXCLUDED.heartbeat_at,
         version = EXCLUDED.version`,
      [leaseKey, input.ownerId, input.cycleId, now.toISOString(), expires.toISOString(), version],
    );
    return {
      acquired: true,
      lease: {
        leaseKey,
        ownerId: input.ownerId,
        cycleId: input.cycleId,
        acquiredAt: now.toISOString(),
        expiresAt: expires.toISOString(),
        heartbeatAt: now.toISOString(),
        version,
      },
    };
  });
}

export async function heartbeatLease(input: {
  leaseKey?: string;
  ownerId: string;
  cycleId: string;
  ttlMs: number;
  client?: SqlClient;
}): Promise<boolean> {
  const db = input.client ?? (await createSqlClient());
  const leaseKey = input.leaseKey ?? "p185:runner";
  const expires = new Date(Date.now() + input.ttlMs).toISOString();
  const result = await db.query(
    `UPDATE p185_leases
     SET heartbeat_at = NOW(), expires_at = $4
     WHERE lease_key = $1 AND owner_id = $2 AND cycle_id = $3
     RETURNING lease_key`,
    [leaseKey, input.ownerId, input.cycleId, expires],
  );
  return result.rowCount > 0;
}

export async function releaseLease(input: {
  leaseKey?: string;
  ownerId: string;
  cycleId: string;
  client?: SqlClient;
}): Promise<boolean> {
  const db = input.client ?? (await createSqlClient());
  const leaseKey = input.leaseKey ?? "p185:runner";
  const result = await db.query(
    `DELETE FROM p185_leases
     WHERE lease_key = $1 AND owner_id = $2 AND cycle_id = $3
     RETURNING lease_key`,
    [leaseKey, input.ownerId, input.cycleId],
  );
  return result.rowCount > 0;
}

export async function createIdempotencyKeyDurable(input: {
  idempotencyKey: string;
  candidateId: string;
  client?: SqlClient;
}): Promise<{ created: boolean }> {
  const db = input.client ?? (await createSqlClient());
  const result = await db.query(
    `INSERT INTO p184_idempotency_keys (idempotency_key, candidate_id, completed)
     VALUES ($1, $2, FALSE)
     ON CONFLICT (idempotency_key) DO NOTHING
     RETURNING idempotency_key`,
    [input.idempotencyKey, input.candidateId],
  );
  return { created: result.rowCount > 0 };
}

export async function markIdempotencyCompleted(
  idempotencyKey: string,
  client?: SqlClient,
): Promise<void> {
  const db = client ?? (await createSqlClient());
  await db.query(
    `UPDATE p184_idempotency_keys SET completed = TRUE WHERE idempotency_key = $1`,
    [idempotencyKey],
  );
}

export async function upsertEnvelopeRecord(input: {
  envelopeId: string;
  candidateId: string;
  idempotencyKey: string;
  state: string;
  lastError?: string | null;
  client?: SqlClient;
}): Promise<void> {
  const db = input.client ?? (await createSqlClient());
  const hash = hashEnvelopeId(input.envelopeId);
  await db.query(
    `INSERT INTO p185_envelopes (
       envelope_id_hash, candidate_id, idempotency_key, state, created_at, updated_at, last_error
     ) VALUES ($1,$2,$3,$4,NOW(),NOW(),$5)
     ON CONFLICT (envelope_id_hash) DO UPDATE SET
       state = EXCLUDED.state,
       updated_at = NOW(),
       last_error = EXCLUDED.last_error`,
    [hash, input.candidateId, input.idempotencyKey, input.state, input.lastError ?? null],
  );
}

export async function healthCheck(client?: SqlClient): Promise<{
  ok: boolean;
  detail: string;
}> {
  try {
    const db = client ?? (await createSqlClient());
    await applyP1855Migrations(db);
    const result = await db.query("SELECT 1 AS ok");
    return { ok: result.rowCount > 0, detail: "Database connectivity OK." };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

function mapLease(row: Record<string, unknown>): LeaseRow {
  return {
    leaseKey: String(row.lease_key),
    ownerId: String(row.owner_id),
    cycleId: String(row.cycle_id),
    acquiredAt: new Date(String(row.acquired_at)).toISOString(),
    expiresAt: new Date(String(row.expires_at)).toISOString(),
    heartbeatAt: new Date(String(row.heartbeat_at)).toISOString(),
    version: Number(row.version),
  };
}

export { DOC_KEYS, hashEnvelopeId };
