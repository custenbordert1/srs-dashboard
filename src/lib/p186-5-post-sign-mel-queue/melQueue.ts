import { createHash, randomUUID } from "node:crypto";
import { applyP1861Migrations } from "@/lib/p186-1-lifecycle-state-machine/migrate";
import { createSqlClient } from "@/lib/p185-5-vercel-durable-storage/sqlClient";
import type { SqlClient } from "@/lib/p185-5-vercel-durable-storage/types";
import { readP1865Flags } from "@/lib/p186-5-post-sign-mel-queue/flags";
import {
  P186_5_CHECKLIST_VERSION,
  P186_5_SCHEMA_VERSION,
  P1865_CREATABLE_MEL_STATUSES,
  type P1865MelQueueItem,
  type P1865MelQueueStatus,
} from "@/lib/p186-5-post-sign-mel-queue/types";

const P186_5_MIGRATION = `
CREATE TABLE IF NOT EXISTS p186_mel_export_queue (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL,
  job_or_project_id TEXT,
  approved_production_state_ref TEXT,
  approval_event_id TEXT,
  checklist_version TEXT NOT NULL,
  readiness_timestamp TIMESTAMPTZ NOT NULL,
  priority TEXT NOT NULL DEFAULT 'medium',
  retry_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  onboarding_assignment_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS p186_mel_export_queue_candidate_idx
  ON p186_mel_export_queue (candidate_id, status);
CREATE INDEX IF NOT EXISTS p186_mel_export_queue_status_idx
  ON p186_mel_export_queue (status, updated_at DESC);

CREATE TABLE IF NOT EXISTS p186_5_audit (
  id TEXT PRIMARY KEY,
  at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  candidate_id TEXT,
  detail TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);
`;

export async function applyP1865Migrations(client?: SqlClient): Promise<void> {
  const db = client ?? (await createSqlClient());
  await applyP1861Migrations(db);
  for (const statement of P186_5_MIGRATION.split(";").map((s) => s.trim()).filter(Boolean)) {
    await db.query(`${statement};`);
  }
  const existing = await db.query(
    "SELECT version FROM p186_schema_migrations WHERE version = $1",
    [P186_5_SCHEMA_VERSION],
  );
  if (existing.rowCount === 0) {
    await db.query("INSERT INTO p186_schema_migrations (version, name) VALUES ($1, $2)", [
      P186_5_SCHEMA_VERSION,
      "005_p186_post_sign_mel_queue",
    ]);
  }
}

export function buildMelIdempotencyKey(input: {
  candidateId: string;
  onboardingAssignmentId: string | null;
  jobOrProjectId: string | null;
  approvalEventId: string | null;
}): string {
  const raw = [
    input.candidateId,
    input.onboardingAssignmentId ?? "",
    input.jobOrProjectId ?? "",
    input.approvalEventId ?? "",
  ].join("|");
  return `mel-${createHash("sha256").update(raw).digest("hex").slice(0, 24)}`;
}

function rowToItem(row: Record<string, unknown>): P1865MelQueueItem {
  return {
    id: String(row.id),
    candidateId: String(row.candidate_id),
    jobOrProjectId: row.job_or_project_id != null ? String(row.job_or_project_id) : null,
    approvedProductionStateRef:
      row.approved_production_state_ref != null
        ? String(row.approved_production_state_ref)
        : null,
    approvalEventId: row.approval_event_id != null ? String(row.approval_event_id) : null,
    checklistVersion: String(row.checklist_version),
    readinessTimestamp: new Date(String(row.readiness_timestamp)).toISOString(),
    priority: (row.priority as P1865MelQueueItem["priority"]) ?? "medium",
    retryCount: Number(row.retry_count ?? 0),
    status: row.status as P1865MelQueueStatus,
    idempotencyKey: String(row.idempotency_key),
    onboardingAssignmentId:
      row.onboarding_assignment_id != null ? String(row.onboarding_assignment_id) : null,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

export type EnqueueMelResult =
  | { ok: true; item: P1865MelQueueItem; created: boolean }
  | { ok: false; reason: string; code: string; existingItem?: P1865MelQueueItem };

/**
 * Durable MEL export queue — P186.5 may only create pending_review / approved_for_export.
 * Never calls MEL write APIs. Never marks confirmed_exported unless observing external event.
 */
export async function enqueueMelExportItem(input: {
  candidateId: string;
  jobOrProjectId?: string | null;
  onboardingAssignmentId?: string | null;
  approvalEventId?: string | null;
  approvedProductionStateRef?: string | null;
  status?: "pending_review" | "approved_for_export";
  priority?: "high" | "medium" | "low";
  existingMelRecord?: boolean;
  existingExportOperation?: boolean;
  client?: SqlClient;
  forceFlags?: { melExportQueue: boolean };
}): Promise<EnqueueMelResult> {
  const flags = readP1865Flags(
    input.forceFlags ? { melExportQueue: input.forceFlags.melExportQueue } : undefined,
  );
  if (!flags.melExportQueue) {
    return { ok: false, reason: "P186_MEL_EXPORT_QUEUE flag is off", code: "flag_off" };
  }

  const status = input.status ?? "pending_review";
  if (!P1865_CREATABLE_MEL_STATUSES.includes(status)) {
    return {
      ok: false,
      reason: `P186.5 cannot create status ${status}`,
      code: "status_not_allowed",
    };
  }
  if (input.existingMelRecord || input.existingExportOperation) {
    return {
      ok: false,
      reason: "Candidate already has MEL record/export — correction workflow required",
      code: "already_exported",
    };
  }

  const db = input.client ?? (await createSqlClient());
  await applyP1865Migrations(db);

  const idempotencyKey = buildMelIdempotencyKey({
    candidateId: input.candidateId,
    onboardingAssignmentId: input.onboardingAssignmentId ?? null,
    jobOrProjectId: input.jobOrProjectId ?? null,
    approvalEventId: input.approvalEventId ?? null,
  });

  const existing = await db.query(
    `SELECT * FROM p186_mel_export_queue WHERE idempotency_key = $1`,
    [idempotencyKey],
  );
  if (existing.rowCount && existing.rows[0]) {
    return { ok: true, item: rowToItem(existing.rows[0] as Record<string, unknown>), created: false };
  }

  // Also block active queue rows for same candidate without correction
  const active = await db.query(
    `SELECT * FROM p186_mel_export_queue
     WHERE candidate_id = $1
       AND status NOT IN ('canceled', 'failed', 'confirmed_exported')
     LIMIT 1`,
    [input.candidateId],
  );
  if (active.rowCount && active.rows[0]) {
    return {
      ok: false,
      reason: "Duplicate MEL queue entry prevented",
      code: "duplicate_queue",
      existingItem: rowToItem(active.rows[0] as Record<string, unknown>),
    };
  }

  const now = new Date().toISOString();
  const id = `melq-${randomUUID()}`;
  try {
    await db.query(
      `INSERT INTO p186_mel_export_queue (
         id, candidate_id, job_or_project_id, approved_production_state_ref,
         approval_event_id, checklist_version, readiness_timestamp, priority,
         retry_count, status, idempotency_key, onboarding_assignment_id, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7::timestamptz,$8,0,$9,$10,$11,$12::timestamptz,$12::timestamptz)`,
      [
        id,
        input.candidateId,
        input.jobOrProjectId ?? null,
        input.approvedProductionStateRef ?? null,
        input.approvalEventId ?? null,
        P186_5_CHECKLIST_VERSION,
        now,
        input.priority ?? "medium",
        status,
        idempotencyKey,
        input.onboardingAssignmentId ?? null,
        now,
      ],
    );
  } catch (err) {
    // Concurrent insert race → return existing
    const again = await db.query(
      `SELECT * FROM p186_mel_export_queue WHERE idempotency_key = $1`,
      [idempotencyKey],
    );
    if (again.rowCount && again.rows[0]) {
      return { ok: true, item: rowToItem(again.rows[0] as Record<string, unknown>), created: false };
    }
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
      code: "insert_failed",
    };
  }

  const created = await db.query(`SELECT * FROM p186_mel_export_queue WHERE id = $1`, [id]);
  return {
    ok: true,
    item: rowToItem(created.rows[0] as Record<string, unknown>),
    created: true,
  };
}

export async function listMelQueue(input?: {
  status?: P1865MelQueueStatus;
  client?: SqlClient;
  limit?: number;
}): Promise<P1865MelQueueItem[]> {
  const db = input?.client ?? (await createSqlClient());
  await applyP1865Migrations(db);
  const limit = input?.limit ?? 500;
  if (input?.status) {
    const result = await db.query(
      `SELECT * FROM p186_mel_export_queue WHERE status = $1 ORDER BY updated_at DESC LIMIT $2`,
      [input.status, limit],
    );
    return result.rows.map((r) => rowToItem(r as Record<string, unknown>));
  }
  const result = await db.query(
    `SELECT * FROM p186_mel_export_queue ORDER BY updated_at DESC LIMIT $1`,
    [limit],
  );
  return result.rows.map((r) => rowToItem(r as Record<string, unknown>));
}

export async function appendP1865Audit(input: {
  actor: string;
  action: string;
  candidateId?: string | null;
  detail: string;
  payload?: unknown;
  client?: SqlClient;
}): Promise<string> {
  const db = input.client ?? (await createSqlClient());
  await applyP1865Migrations(db);
  const id = `p1865a-${randomUUID()}`;
  await db.query(
    `INSERT INTO p186_5_audit (id, actor, action, candidate_id, detail, payload)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
    [
      id,
      input.actor,
      input.action,
      input.candidateId ?? null,
      input.detail,
      JSON.stringify(input.payload ?? {}),
    ],
  );
  return id;
}

/** Observe-only: mark confirmed_exported when an external production event is observed. */
export async function observeExternalMelExport(input: {
  candidateId: string;
  externalEventId: string;
  client?: SqlClient;
}): Promise<{ ok: boolean; detail: string }> {
  const db = input.client ?? (await createSqlClient());
  await applyP1865Migrations(db);
  const result = await db.query(
    `UPDATE p186_mel_export_queue
     SET status = 'confirmed_exported', updated_at = NOW(),
         approval_event_id = COALESCE(approval_event_id, $2)
     WHERE candidate_id = $1
       AND status IN ('export_queued', 'export_in_progress', 'exported_unverified', 'approved_for_export')
     RETURNING id`,
    [input.candidateId, input.externalEventId],
  );
  await appendP1865Audit({
    actor: "system:observe",
    action: "observe_external_mel_export",
    candidateId: input.candidateId,
    detail: result.rowCount
      ? `Observed external MEL export ${input.externalEventId}`
      : "No matching queue row to confirm",
    client: db,
  });
  return {
    ok: true,
    detail: result.rowCount ? "confirmed_exported via observation" : "no queue row updated",
  };
}
