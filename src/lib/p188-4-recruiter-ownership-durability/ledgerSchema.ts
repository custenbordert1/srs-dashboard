/** Neon / PGlite DDL for append-only recruiter ownership ledger. */
export const P1884_MIGRATION_001 = `
CREATE TABLE IF NOT EXISTS p188_schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS p188_ownership_ledger (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL,
  previous_recruiter TEXT,
  new_recruiter TEXT,
  source TEXT NOT NULL,
  actor TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  reason TEXT NOT NULL,
  at TIMESTAMPTZ NOT NULL,
  correlation_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  workflow_version INTEGER NOT NULL DEFAULT 0,
  confidence DOUBLE PRECISION,
  evidence_reference TEXT,
  rollback_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS p188_ownership_ledger_idempotency_uidx
  ON p188_ownership_ledger (idempotency_key);
CREATE INDEX IF NOT EXISTS p188_ownership_ledger_candidate_idx
  ON p188_ownership_ledger (candidate_id, at DESC);
CREATE INDEX IF NOT EXISTS p188_ownership_ledger_correlation_idx
  ON p188_ownership_ledger (correlation_id);
`;

export const P1884_MIGRATION_NAME = "p188_4_ownership_ledger_v1";
