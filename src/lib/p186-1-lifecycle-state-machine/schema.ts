/** P186.1 Neon schema — separate from P184/P185 paperwork tables. */
export const P186_1_MIGRATION_001 = `
CREATE TABLE IF NOT EXISTS p186_schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS p186_lifecycle_records (
  candidate_id TEXT PRIMARY KEY,
  state TEXT NOT NULL,
  previous_state TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  blocked_reason TEXT,
  correlation_id TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS p186_lifecycle_state_idx ON p186_lifecycle_records (state);
CREATE INDEX IF NOT EXISTS p186_lifecycle_updated_idx ON p186_lifecycle_records (updated_at DESC);

CREATE TABLE IF NOT EXISTS p186_lifecycle_audit (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL,
  at TIMESTAMPTZ NOT NULL,
  actor TEXT NOT NULL,
  source TEXT NOT NULL,
  previous_state TEXT,
  new_state TEXT NOT NULL,
  reason TEXT NOT NULL,
  correlation_id TEXT,
  accepted BOOLEAN NOT NULL,
  rejection_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS p186_audit_candidate_idx ON p186_lifecycle_audit (candidate_id, at DESC);
CREATE INDEX IF NOT EXISTS p186_audit_at_idx ON p186_lifecycle_audit (at DESC);

CREATE TABLE IF NOT EXISTS p186_processed_events (
  event_id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  audit_id TEXT
);

CREATE TABLE IF NOT EXISTS p186_shadow_findings (
  id BIGSERIAL PRIMARY KEY,
  candidate_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  production_derived_state TEXT,
  shadow_state TEXT,
  detail TEXT NOT NULL,
  at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS p186_shadow_at_idx ON p186_shadow_findings (at DESC);

CREATE TABLE IF NOT EXISTS p186_shadow_runs (
  id BIGSERIAL PRIMARY KEY,
  projected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  evaluated INTEGER NOT NULL,
  matches INTEGER NOT NULL,
  mismatches INTEGER NOT NULL,
  duplicate_transitions INTEGER NOT NULL,
  invalid_transitions INTEGER NOT NULL,
  missing_transitions INTEGER NOT NULL,
  impossible_transitions INTEGER NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);
`;

export const P186_1_MIGRATION_NAME = "001_init_p186_lifecycle_shadow";
