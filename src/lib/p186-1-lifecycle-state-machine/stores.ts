import { randomUUID } from "node:crypto";
import { applyP1861Migrations } from "@/lib/p186-1-lifecycle-state-machine/migrate";
import type {
  P186AuditEntry,
  P186LifecycleRecord,
  P186LifecycleState,
  P186TransitionActor,
  P186TransitionSource,
} from "@/lib/p186-1-lifecycle-state-machine/types";
import { createSqlClient } from "@/lib/p185-5-vercel-durable-storage/sqlClient";
import type { SqlClient } from "@/lib/p185-5-vercel-durable-storage/types";

function rowToRecord(row: Record<string, unknown>): P186LifecycleRecord {
  return {
    candidateId: String(row.candidate_id),
    state: row.state as P186LifecycleState,
    previousState: (row.previous_state as P186LifecycleState | null) ?? null,
    version: Number(row.version ?? 1),
    blockedReason: row.blocked_reason != null ? String(row.blocked_reason) : null,
    updatedAt: new Date(String(row.updated_at)).toISOString(),
    correlationId: row.correlation_id != null ? String(row.correlation_id) : null,
  };
}

function rowToAudit(row: Record<string, unknown>): P186AuditEntry {
  return {
    id: String(row.id),
    candidateId: String(row.candidate_id),
    at: new Date(String(row.at)).toISOString(),
    actor: String(row.actor) as P186TransitionActor,
    source: String(row.source) as P186TransitionSource,
    previousState: (row.previous_state as P186LifecycleState | null) ?? null,
    newState: row.new_state as P186LifecycleState,
    reason: String(row.reason),
    correlationId: row.correlation_id != null ? String(row.correlation_id) : null,
    accepted: Boolean(row.accepted),
    rejectionCode: row.rejection_code != null ? String(row.rejection_code) : null,
  };
}

export class LifecycleAuditStore {
  constructor(private readonly client?: SqlClient) {}

  private async db(): Promise<SqlClient> {
    const db = this.client ?? (await createSqlClient());
    await applyP1861Migrations(db);
    return db;
  }

  async append(entry: Omit<P186AuditEntry, "id"> & { id?: string }): Promise<P186AuditEntry> {
    const db = await this.db();
    const id = entry.id ?? `aud-${randomUUID()}`;
    await db.query(
      `INSERT INTO p186_lifecycle_audit (
         id, candidate_id, at, actor, source, previous_state, new_state, reason,
         correlation_id, accepted, rejection_code
       ) VALUES ($1,$2,$3::timestamptz,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        id,
        entry.candidateId,
        entry.at,
        entry.actor,
        entry.source,
        entry.previousState,
        entry.newState,
        entry.reason,
        entry.correlationId,
        entry.accepted,
        entry.rejectionCode,
      ],
    );
    return { ...entry, id };
  }

  async listForCandidate(candidateId: string, limit = 100): Promise<P186AuditEntry[]> {
    const db = await this.db();
    const result = await db.query(
      `SELECT * FROM p186_lifecycle_audit
       WHERE candidate_id = $1
       ORDER BY at ASC, created_at ASC
       LIMIT $2`,
      [candidateId, limit],
    );
    return result.rows.map(rowToAudit);
  }

  async count(): Promise<number> {
    const db = await this.db();
    const result = await db.query(`SELECT COUNT(*)::int AS n FROM p186_lifecycle_audit`);
    return Number(result.rows[0]?.n ?? 0);
  }

  /** Reconstruct state by replaying accepted audits in order. */
  async reconstructState(candidateId: string): Promise<P186LifecycleState | null> {
    const entries = await this.listForCandidate(candidateId, 10_000);
    let state: P186LifecycleState | null = null;
    for (const entry of entries) {
      if (entry.accepted) state = entry.newState;
    }
    return state;
  }
}

export class LifecycleRecordStore {
  constructor(private readonly client?: SqlClient) {}

  private async db(): Promise<SqlClient> {
    const db = this.client ?? (await createSqlClient());
    await applyP1861Migrations(db);
    return db;
  }

  async get(candidateId: string): Promise<P186LifecycleRecord | null> {
    const db = await this.db();
    const result = await db.query(
      `SELECT * FROM p186_lifecycle_records WHERE candidate_id = $1`,
      [candidateId],
    );
    const row = result.rows[0];
    return row ? rowToRecord(row) : null;
  }

  async listAll(limit = 5_000): Promise<P186LifecycleRecord[]> {
    const db = await this.db();
    const result = await db.query(
      `SELECT * FROM p186_lifecycle_records ORDER BY updated_at DESC LIMIT $1`,
      [limit],
    );
    return result.rows.map(rowToRecord);
  }

  async countsByState(): Promise<Record<string, number>> {
    const db = await this.db();
    const result = await db.query(
      `SELECT state, COUNT(*)::int AS n FROM p186_lifecycle_records GROUP BY state`,
    );
    return Object.fromEntries(
      result.rows.map((r) => [String(r.state), Number(r.n)]),
    );
  }

  /**
   * CAS upsert: insert if missing, else update only when version matches.
   */
  async compareAndSet(input: {
    candidateId: string;
    expectedVersion: number | null;
    state: P186LifecycleState;
    previousState: P186LifecycleState | null;
    blockedReason?: string | null;
    correlationId?: string | null;
    updatedAt?: string;
  }): Promise<{ ok: boolean; record: P186LifecycleRecord | null }> {
    const db = await this.db();
    const updatedAt = input.updatedAt ?? new Date().toISOString();

    if (input.expectedVersion == null) {
      try {
        await db.query(
          `INSERT INTO p186_lifecycle_records (
             candidate_id, state, previous_state, version, blocked_reason, correlation_id, updated_at
           ) VALUES ($1,$2,$3,1,$4,$5,$6::timestamptz)`,
          [
            input.candidateId,
            input.state,
            input.previousState,
            input.blockedReason ?? null,
            input.correlationId ?? null,
            updatedAt,
          ],
        );
        const record = await this.get(input.candidateId);
        return { ok: true, record };
      } catch {
        return { ok: false, record: await this.get(input.candidateId) };
      }
    }

    const result = await db.query(
      `UPDATE p186_lifecycle_records
       SET state = $1,
           previous_state = $2,
           version = version + 1,
           blocked_reason = $3,
           correlation_id = $4,
           updated_at = $5::timestamptz
       WHERE candidate_id = $6 AND version = $7
       RETURNING *`,
      [
        input.state,
        input.previousState,
        input.blockedReason ?? null,
        input.correlationId ?? null,
        updatedAt,
        input.candidateId,
        input.expectedVersion,
      ],
    );
    if (result.rowCount === 0) {
      return { ok: false, record: await this.get(input.candidateId) };
    }
    return { ok: true, record: rowToRecord(result.rows[0]!) };
  }
}

export async function hasProcessedEvent(
  eventId: string,
  client?: SqlClient,
): Promise<boolean> {
  const db = client ?? (await createSqlClient());
  await applyP1861Migrations(db);
  const result = await db.query(
    `SELECT 1 FROM p186_processed_events WHERE event_id = $1`,
    [eventId],
  );
  return result.rowCount > 0;
}

export async function markProcessedEvent(input: {
  eventId: string;
  candidateId: string;
  auditId: string | null;
  client?: SqlClient;
}): Promise<void> {
  const db = input.client ?? (await createSqlClient());
  await applyP1861Migrations(db);
  await db.query(
    `INSERT INTO p186_processed_events (event_id, candidate_id, audit_id)
     VALUES ($1,$2,$3)
     ON CONFLICT (event_id) DO NOTHING`,
    [input.eventId, input.candidateId, input.auditId],
  );
}
