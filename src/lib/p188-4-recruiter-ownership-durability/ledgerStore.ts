import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { createSqlClient } from "@/lib/p185-5-vercel-durable-storage/sqlClient";
import { recruitingDataDir, safeRecruitingMkdir } from "@/lib/recruiting-data-dir";
import { applyP1884Migrations } from "@/lib/p188-4-recruiter-ownership-durability/ledgerMigrate";
import type { P1884LedgerEvent, P1884OwnershipSource } from "@/lib/p188-4-recruiter-ownership-durability/types";

const memoryLedger: P1884LedgerEvent[] = [];

function jsonlPath(): string {
  return path.join(recruitingDataDir(), "p188-4-ownership-ledger.jsonl");
}

function rowToEvent(row: Record<string, unknown>): P1884LedgerEvent {
  return {
    id: String(row.id),
    candidateId: String(row.candidate_id),
    previousRecruiter: row.previous_recruiter != null ? String(row.previous_recruiter) : null,
    newRecruiter: row.new_recruiter != null ? String(row.new_recruiter) : null,
    source: String(row.source) as P1884OwnershipSource,
    actor: String(row.actor),
    actorRole: String(row.actor_role),
    reason: String(row.reason),
    at: new Date(String(row.at)).toISOString(),
    correlationId: String(row.correlation_id),
    idempotencyKey: String(row.idempotency_key),
    workflowVersion: Number(row.workflow_version ?? 0),
    confidence: row.confidence != null ? Number(row.confidence) : null,
    evidenceReference: row.evidence_reference != null ? String(row.evidence_reference) : null,
    rollbackReference: row.rollback_reference != null ? String(row.rollback_reference) : null,
  };
}

export function resetP1884LedgerMemoryForTests(): void {
  memoryLedger.length = 0;
}

export function listP1884LedgerMemoryForTests(): P1884LedgerEvent[] {
  return [...memoryLedger];
}

export async function appendOwnershipLedgerEvent(
  input: Omit<P1884LedgerEvent, "id" | "at"> & { id?: string; at?: string },
): Promise<P1884LedgerEvent> {
  const event: P1884LedgerEvent = {
    id: input.id ?? `own-${randomUUID()}`,
    at: input.at ?? new Date().toISOString(),
    candidateId: input.candidateId,
    previousRecruiter: input.previousRecruiter,
    newRecruiter: input.newRecruiter,
    source: input.source,
    actor: input.actor,
    actorRole: input.actorRole,
    reason: input.reason,
    correlationId: input.correlationId,
    idempotencyKey: input.idempotencyKey,
    workflowVersion: input.workflowVersion,
    confidence: input.confidence,
    evidenceReference: input.evidenceReference,
    rollbackReference: input.rollbackReference,
  };

  // Idempotency: skip duplicate key in memory
  if (memoryLedger.some((e) => e.idempotencyKey === event.idempotencyKey)) {
    return memoryLedger.find((e) => e.idempotencyKey === event.idempotencyKey)!;
  }
  memoryLedger.push(event);

  // Append-only JSONL (local durability; .data/ is gitignored)
  try {
    await safeRecruitingMkdir(recruitingDataDir());
    await appendFile(jsonlPath(), `${JSON.stringify(event)}\n`, "utf8");
  } catch {
    // memory still holds event for process lifetime
  }

  // Neon / PGlite only when explicitly enabled (avoid blocking upserts on DB latency).
  if (process.env.P188_OWNERSHIP_LEDGER_SQL === "1" || process.env.P188_FORCE_LEDGER_SQL === "1") {
    try {
      const db = await createSqlClient({
        forcePglite: !process.env.DATABASE_URL && !process.env.P185_DATABASE_URL,
      });
      await applyP1884Migrations(db);
      await db.query(
        `INSERT INTO p188_ownership_ledger (
           id, candidate_id, previous_recruiter, new_recruiter, source, actor, actor_role,
           reason, at, correlation_id, idempotency_key, workflow_version, confidence,
           evidence_reference, rollback_reference
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9::timestamptz,$10,$11,$12,$13,$14,$15
         )
         ON CONFLICT (idempotency_key) DO NOTHING`,
        [
          event.id,
          event.candidateId,
          event.previousRecruiter,
          event.newRecruiter,
          event.source,
          event.actor,
          event.actorRole,
          event.reason,
          event.at,
          event.correlationId,
          event.idempotencyKey,
          event.workflowVersion,
          event.confidence,
          event.evidenceReference,
          event.rollbackReference,
        ],
      );
    } catch {
      // Fail soft for SQL — JSONL/memory remain append-only sources
    }
  }

  return event;
}

export async function listOwnershipLedgerForCandidate(
  candidateId: string,
  limit = 100,
): Promise<P1884LedgerEvent[]> {
  if (process.env.P188_OWNERSHIP_LEDGER_SQL === "1" || process.env.P188_FORCE_LEDGER_SQL === "1") {
    try {
      const db = await createSqlClient({
        forcePglite: !process.env.DATABASE_URL && !process.env.P185_DATABASE_URL,
      });
      await applyP1884Migrations(db);
      const result = await db.query(
        `SELECT * FROM p188_ownership_ledger
         WHERE candidate_id = $1
         ORDER BY at DESC
         LIMIT $2`,
        [candidateId, limit],
      );
      return result.rows.map((r) => rowToEvent(r as Record<string, unknown>));
    } catch {
      // fall through
    }
  }

  const fromMemory = memoryLedger
    .filter((e) => e.candidateId === candidateId)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, limit);
  if (fromMemory.length > 0) return fromMemory;

  try {
    const raw = await readFile(jsonlPath(), "utf8");
    const events = raw
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as P1884LedgerEvent)
      .filter((e) => e.candidateId === candidateId)
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, limit);
    return events;
  } catch {
    return [];
  }
}

export async function validateOwnershipLedgerHealth(): Promise<{
  ok: boolean;
  backend: "memory_jsonl" | "sql" | "both";
  memoryCount: number;
  sqlConfigured: boolean;
  detail: string;
}> {
  const sqlConfigured =
    process.env.P188_OWNERSHIP_LEDGER_SQL === "1" || process.env.P188_FORCE_LEDGER_SQL === "1";
  let sqlOk = false;
  if (sqlConfigured) {
    try {
      const db = await createSqlClient({
        forcePglite: !process.env.DATABASE_URL && !process.env.P185_DATABASE_URL,
      });
      await applyP1884Migrations(db);
      await db.query(`SELECT 1 FROM p188_ownership_ledger LIMIT 1`);
      sqlOk = true;
    } catch (err) {
      return {
        ok: false,
        backend: "memory_jsonl",
        memoryCount: memoryLedger.length,
        sqlConfigured: true,
        detail: `SQL ledger migrate/query failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  // Prove append-only write path for validation
  const probeKey = `health:${createHash("sha256").update(String(Date.now())).digest("hex").slice(0, 12)}`;
  await appendOwnershipLedgerEvent({
    candidateId: "__p1884_health__",
    previousRecruiter: null,
    newRecruiter: null,
    source: "unassigned",
    actor: "p188.4-validation",
    actorRole: "system",
    reason: "ledger health probe",
    correlationId: probeKey,
    idempotencyKey: probeKey,
    workflowVersion: 0,
    confidence: null,
    evidenceReference: null,
    rollbackReference: null,
  });

  return {
    ok: true,
    backend: sqlOk ? "both" : "memory_jsonl",
    memoryCount: memoryLedger.length,
    sqlConfigured,
    detail: sqlOk
      ? "Append-only ledger healthy (SQL + memory/jsonl)"
      : "Append-only ledger healthy (memory/jsonl); enable P188_OWNERSHIP_LEDGER_SQL=1 for Neon/PGlite",
  };
}

export async function ensureLedgerDir(): Promise<void> {
  await mkdir(recruitingDataDir(), { recursive: true });
}
