import { randomUUID } from "node:crypto";
import { applyP1861Migrations } from "@/lib/p186-1-lifecycle-state-machine/migrate";
import { createSqlClient } from "@/lib/p185-5-vercel-durable-storage/sqlClient";
import type { SqlClient } from "@/lib/p185-5-vercel-durable-storage/types";
import { P186_3_SCHEMA_VERSION } from "@/lib/p186-3-operator-lifecycle-queues/types";

const P186_3_MIGRATION = `
CREATE TABLE IF NOT EXISTS p186_operator_audit (
  id TEXT PRIMARY KEY,
  at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor TEXT NOT NULL,
  role TEXT NOT NULL,
  action TEXT NOT NULL,
  candidate_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  correlation_id TEXT NOT NULL,
  ok BOOLEAN NOT NULL,
  detail TEXT NOT NULL,
  succeeded JSONB NOT NULL DEFAULT '[]'::jsonb,
  failed JSONB NOT NULL DEFAULT '[]'::jsonb,
  production_event_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  preview JSONB,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS p186_operator_audit_at_idx ON p186_operator_audit (at DESC);

CREATE TABLE IF NOT EXISTS p186_operator_notes (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL,
  at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor TEXT NOT NULL,
  note TEXT NOT NULL,
  label TEXT
);
CREATE INDEX IF NOT EXISTS p186_operator_notes_candidate_idx ON p186_operator_notes (candidate_id, at DESC);
`;

export async function applyP1863Migrations(client?: SqlClient): Promise<void> {
  const db = client ?? (await createSqlClient());
  await applyP1861Migrations(db);
  for (const statement of P186_3_MIGRATION.split(";").map((s) => s.trim()).filter(Boolean)) {
    await db.query(`${statement};`);
  }
  const existing = await db.query(
    "SELECT version FROM p186_schema_migrations WHERE version = $1",
    [P186_3_SCHEMA_VERSION],
  );
  if (existing.rowCount === 0) {
    await db.query("INSERT INTO p186_schema_migrations (version, name) VALUES ($1, $2)", [
      P186_3_SCHEMA_VERSION,
      "003_p186_operator_queues",
    ]);
  }
}

export async function appendOperatorAudit(input: {
  actor: string;
  role: string;
  action: string;
  candidateIds: string[];
  correlationId: string;
  ok: boolean;
  detail: string;
  succeeded: string[];
  failed: Array<{ candidateId: string; reason: string }>;
  productionEventIds?: string[];
  preview?: unknown;
  client?: SqlClient;
}): Promise<string> {
  const db = input.client ?? (await createSqlClient());
  await applyP1863Migrations(db);
  const id = `opa-${randomUUID()}`;
  await db.query(
    `INSERT INTO p186_operator_audit (
       id, actor, role, action, candidate_ids, correlation_id, ok, detail,
       succeeded, failed, production_event_ids, preview
     ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,$12::jsonb)`,
    [
      id,
      input.actor,
      input.role,
      input.action,
      JSON.stringify(input.candidateIds),
      input.correlationId,
      input.ok,
      input.detail,
      JSON.stringify(input.succeeded),
      JSON.stringify(input.failed),
      JSON.stringify(input.productionEventIds ?? []),
      JSON.stringify(input.preview ?? null),
    ],
  );
  return id;
}

export async function addOperatorNote(input: {
  candidateId: string;
  actor: string;
  note: string;
  label?: string | null;
  client?: SqlClient;
}): Promise<string> {
  const db = input.client ?? (await createSqlClient());
  await applyP1863Migrations(db);
  const id = `note-${randomUUID().slice(0, 12)}`;
  await db.query(
    `INSERT INTO p186_operator_notes (id, candidate_id, actor, note, label)
     VALUES ($1,$2,$3,$4,$5)`,
    [id, input.candidateId, input.actor, input.note.slice(0, 2000), input.label ?? null],
  );
  return id;
}
