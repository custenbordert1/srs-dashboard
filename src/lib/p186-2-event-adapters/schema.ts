/** P186.2 schema additions (version 2). */
export const P186_2_MIGRATION_002 = `
CREATE TABLE IF NOT EXISTS p186_event_inbox (
  event_id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL,
  candidate_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  source_system TEXT NOT NULL,
  source_timestamp TIMESTAMPTZ NOT NULL,
  received_timestamp TIMESTAMPTZ NOT NULL,
  actor TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  payload_version INTEGER NOT NULL,
  redacted_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  disposition TEXT NOT NULL,
  detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS p186_event_inbox_idem_uidx ON p186_event_inbox (idempotency_key);
CREATE INDEX IF NOT EXISTS p186_event_inbox_source_idx ON p186_event_inbox (source_system, source_timestamp DESC);
CREATE INDEX IF NOT EXISTS p186_event_inbox_candidate_idx ON p186_event_inbox (candidate_id, received_timestamp DESC);

CREATE TABLE IF NOT EXISTS p186_ingest_comparisons (
  id BIGSERIAL PRIMARY KEY,
  event_id TEXT NOT NULL,
  candidate_id TEXT NOT NULL,
  comparison TEXT NOT NULL,
  production_derived_state TEXT,
  shadow_before TEXT,
  shadow_after TEXT,
  detail TEXT NOT NULL,
  at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS p186_ingest_cmp_at_idx ON p186_ingest_comparisons (at DESC);

CREATE TABLE IF NOT EXISTS p186_reconciliation_runs (
  id BIGSERIAL PRIMARY KEY,
  run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  evaluated INTEGER NOT NULL,
  findings INTEGER NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS p186_reconciliation_findings (
  id BIGSERIAL PRIMARY KEY,
  run_id BIGINT,
  candidate_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  breezy_stage TEXT,
  workflow_state TEXT,
  paperwork_state TEXT,
  dropbox_state TEXT,
  onboarding_state TEXT,
  mel_ready_state TEXT,
  shadow_state TEXT,
  detail TEXT NOT NULL,
  at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

export const P186_2_MIGRATION_NAME = "002_p186_event_adapters_shadow";
