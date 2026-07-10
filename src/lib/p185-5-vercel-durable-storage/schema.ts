/** SQL migration v1 — P185.5 durable paperwork store. */
export const P1855_MIGRATION_001 = `
CREATE TABLE IF NOT EXISTS p1855_schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS p1855_documents (
  doc_key TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,
  checksum TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS p184_config (
  id TEXT PRIMARY KEY DEFAULT 'default',
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS p184_queue_items (
  candidate_id TEXT PRIMARY KEY,
  rollout_id TEXT,
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL,
  payload JSONB NOT NULL,
  priority_composite DOUBLE PRECISION NOT NULL DEFAULT 0,
  enqueued_at TIMESTAMPTZ NOT NULL,
  next_attempt_at TIMESTAMPTZ,
  claimed_by TEXT,
  claim_expires_at TIMESTAMPTZ,
  envelope_id_hash TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS p184_queue_idempotency_uidx ON p184_queue_items (idempotency_key);
CREATE INDEX IF NOT EXISTS p184_queue_status_idx ON p184_queue_items (status);
CREATE INDEX IF NOT EXISTS p184_queue_retry_due_idx ON p184_queue_items (next_attempt_at);
CREATE INDEX IF NOT EXISTS p184_queue_rollout_idx ON p184_queue_items (rollout_id);
CREATE INDEX IF NOT EXISTS p184_queue_priority_idx ON p184_queue_items (priority_composite DESC, enqueued_at ASC);

CREATE TABLE IF NOT EXISTS p184_idempotency_keys (
  idempotency_key TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS p184_idempotency_candidate_idx ON p184_idempotency_keys (candidate_id);

CREATE TABLE IF NOT EXISTS p184_send_timestamps (
  id BIGSERIAL PRIMARY KEY,
  sent_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS p184_send_timestamps_at_idx ON p184_send_timestamps (sent_at);

CREATE TABLE IF NOT EXISTS p185_leases (
  lease_key TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  cycle_id TEXT NOT NULL,
  acquired_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  heartbeat_at TIMESTAMPTZ NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS p185_leases_expiry_idx ON p185_leases (expires_at);

CREATE TABLE IF NOT EXISTS p185_operations (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  stage TEXT NOT NULL,
  envelope_id_hash TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS p185_operations_idempotency_uidx ON p185_operations (idempotency_key);
CREATE INDEX IF NOT EXISTS p185_operations_stage_idx ON p185_operations (stage);
CREATE INDEX IF NOT EXISTS p185_operations_candidate_idx ON p185_operations (candidate_id);

CREATE TABLE IF NOT EXISTS p185_envelopes (
  envelope_id_hash TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  state TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ,
  last_error TEXT,
  verification_attempts INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS p185_envelopes_state_idx ON p185_envelopes (state);
CREATE INDEX IF NOT EXISTS p185_envelopes_candidate_idx ON p185_envelopes (candidate_id);

CREATE TABLE IF NOT EXISTS p185_audit_events (
  id BIGSERIAL PRIMARY KEY,
  at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  candidate_id TEXT,
  rollout_id TEXT,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS p185_audit_at_idx ON p185_audit_events (at DESC);
CREATE INDEX IF NOT EXISTS p185_audit_rollout_idx ON p185_audit_events (rollout_id);

CREATE TABLE IF NOT EXISTS p1853_rollouts (
  rollout_id TEXT PRIMARY KEY,
  cohort_id TEXT NOT NULL,
  frozen_at TIMESTAMPTZ NOT NULL,
  approved_count INTEGER NOT NULL,
  phase TEXT NOT NULL,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS p1853_cohort_members (
  rollout_id TEXT NOT NULL REFERENCES p1853_rollouts(rollout_id) ON DELETE CASCADE,
  candidate_id TEXT NOT NULL,
  resolved_position_id TEXT,
  template_key TEXT,
  email_hash TEXT,
  idempotency_key TEXT NOT NULL,
  queue_timestamp TIMESTAMPTZ,
  evidence_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  blocked_reason TEXT,
  removed BOOLEAN NOT NULL DEFAULT FALSE,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (rollout_id, candidate_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS p1853_member_idempotency_uidx ON p1853_cohort_members (idempotency_key);
CREATE INDEX IF NOT EXISTS p1853_member_candidate_idx ON p1853_cohort_members (candidate_id);
`;

export const P1855_MIGRATION_NAME = "001_init_durable_paperwork_store";
