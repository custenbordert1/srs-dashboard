/**
 * P185.5 — Vercel-compatible durable storage for P184/P185.
 * Provider: Neon / Vercel Postgres (production) or PGlite (local/tests).
 * Never stores secrets or signing URLs.
 */

export const P185_5_SOURCE_PHASE = "P185.5";
export const P185_5_SCHEMA_VERSION = 1;
export const P185_5_OPERATOR = "P185.5 Vercel Durable Storage";

export type P1855ProviderName = "neon_postgres" | "vercel_postgres" | "pglite_local" | "unconfigured";

export type P1855AdapterType = "postgres";

export type SqlParam =
  | string
  | number
  | boolean
  | null
  | Date
  | string[]
  | number[]
  | boolean[]
  | Record<string, unknown>
  | unknown[];

export type SqlQueryResult = {
  rows: Record<string, unknown>[];
  rowCount: number;
};

export type SqlClient = {
  provider: P1855ProviderName;
  query: (sql: string, params?: SqlParam[]) => Promise<SqlQueryResult>;
  transaction: <T>(fn: (tx: SqlClient) => Promise<T>) => Promise<T>;
  close: () => Promise<void>;
};

export type DurableDocument = {
  key: string;
  value: unknown;
  version: number;
  updatedAt: string;
  checksum: string;
};

export type QueueClaimResult =
  | {
      claimed: true;
      candidateId: string;
      idempotencyKey: string;
      item: Record<string, unknown>;
    }
  | {
      claimed: false;
      reason: string;
    };

export type LeaseRow = {
  leaseKey: string;
  ownerId: string;
  cycleId: string;
  acquiredAt: string;
  expiresAt: string;
  heartbeatAt: string;
  version: number;
};

export type MigrationChecksum = {
  entity: string;
  sourceCount: number;
  destinationCount: number;
  sourceHash: string;
  destinationHash: string;
  ok: boolean;
};

export type P1855MigrationReport = {
  phase: typeof P185_5_SOURCE_PHASE;
  generatedAt: string;
  provider: P1855ProviderName;
  schemaVersion: number;
  rolloutId: string | null;
  before: { queueDepth: number; frozenCohort: number };
  after: { queueDepth: number; frozenCohort: number };
  recordsMigrated: Record<string, number>;
  checksums: MigrationChecksum[];
  duplicateCandidateIds: string[];
  missingQueueItems: string[];
  ok: boolean;
  errors: string[];
};

export type P1855ValidationReport = {
  restartTest: boolean;
  concurrencyTest: boolean;
  staleLeaseTakeover: boolean;
  idempotencySurvivesRestart: boolean;
  sentUnverifiedNoResend: boolean;
  queueOrderingPreserved: boolean;
  rateLimitCountersPersist: boolean;
  details: string[];
};

export type P1855HealthReport = {
  phase: typeof P185_5_SOURCE_PHASE;
  generatedAt: string;
  adapterType: P1855AdapterType | "unconfigured";
  providerNameRedacted: string;
  databaseConnectivity: boolean;
  schemaVersion: number | null;
  migrationStatus: "applied" | "pending" | "unconfigured" | "failed";
  queueCount: number | null;
  frozenCohortCount: number | null;
  leaseHealth: "free" | "held" | "stale" | "unknown";
  transactionCapability: boolean;
  idempotencyHealth: boolean;
  storageConfirmationStatus: "ready_to_confirm" | "not_ready" | "env_set_but_unverified";
  durable: boolean;
  blockers: string[];
};

export const DOC_KEYS = {
  p184State: "p184:engine_state",
  p185State: "p185:runner_state",
  p1853State: "p1853:rollout_state",
  meta: "p1855:meta",
} as const;
