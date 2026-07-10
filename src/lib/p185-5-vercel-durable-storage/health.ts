import { getDocument, healthCheck, DOC_KEYS } from "@/lib/p185-5-vercel-durable-storage/adapter";
import { getAppliedSchemaVersion, applyP1855Migrations } from "@/lib/p185-5-vercel-durable-storage/migrate";
import {
  createSqlClient,
  isP1855DurableConfigured,
  redactProviderName,
  resolveDatabaseUrl,
} from "@/lib/p185-5-vercel-durable-storage/sqlClient";
import { validationPassed } from "@/lib/p185-5-vercel-durable-storage/validation";
import type { P1855HealthReport, P1855ValidationReport } from "@/lib/p185-5-vercel-durable-storage/types";
import { P185_5_SOURCE_PHASE } from "@/lib/p185-5-vercel-durable-storage/types";

export async function buildP1855HealthReport(input?: {
  validation?: P1855ValidationReport | null;
}): Promise<P1855HealthReport> {
  const blockers: string[] = [];
  if (!isP1855DurableConfigured()) {
    return {
      phase: P185_5_SOURCE_PHASE,
      generatedAt: new Date().toISOString(),
      adapterType: "unconfigured",
      providerNameRedacted: "unconfigured",
      databaseConnectivity: false,
      schemaVersion: null,
      migrationStatus: "unconfigured",
      queueCount: null,
      frozenCohortCount: null,
      leaseHealth: "unknown",
      transactionCapability: false,
      idempotencyHealth: false,
      storageConfirmationStatus: "not_ready",
      durable: false,
      blockers: [
        "No durable database configured. Set P185_DATABASE_URL / POSTGRES_URL / DATABASE_URL (Neon or Vercel Postgres), or P185_PGLITE_DATA_DIR for local durable PGlite.",
      ],
    };
  }

  try {
    const db = await createSqlClient();
    const connectivity = await healthCheck(db);
    if (!connectivity.ok) {
      blockers.push(`Database connectivity failed: ${connectivity.detail}`);
    }
    await applyP1855Migrations(db);
    const schemaVersion = await getAppliedSchemaVersion(db);
    const queue = await db.query(
      `SELECT COUNT(*)::int AS n FROM p184_queue_items WHERE status IN ('queued','failed_transient')`,
    );
    const cohort = await db.query(`SELECT COUNT(*)::int AS n FROM p1853_cohort_members`);
    const lease = await db.query(
      `SELECT expires_at FROM p185_leases WHERE lease_key = 'p185:runner' LIMIT 1`,
    );
    let leaseHealth: P1855HealthReport["leaseHealth"] = "free";
    if (lease.rows[0]) {
      const exp = new Date(String(lease.rows[0].expires_at)).getTime();
      leaseHealth = exp > Date.now() ? "held" : "stale";
    }
    const unresolved = await db.query(
      `SELECT COUNT(*)::int AS n FROM p185_operations WHERE stage IN ('send_requested','sent_unverified')`,
    );
    const unresolvedCount = Number(unresolved.rows[0]?.n ?? 0);
    const queueCount = Number(queue.rows[0]?.n ?? 0);
    const frozenCohortCount = Number(cohort.rows[0]?.n ?? 0);
    const idem = await db.query(`SELECT COUNT(*)::int AS n FROM p184_idempotency_keys`);
    const idempotencyHealth = Number(idem.rows[0]?.n ?? 0) >= 0 && connectivity.ok;

    const validationOk = input?.validation ? validationPassed(input.validation) : false;
    if (queueCount !== 25) blockers.push(`Queue count is ${queueCount}, expected 25.`);
    if (frozenCohortCount !== 25) blockers.push(`Frozen cohort is ${frozenCohortCount}, expected 25.`);
    if (unresolvedCount > 0) blockers.push(`${unresolvedCount} unresolved send operations.`);
    if (input?.validation && !validationOk) blockers.push("Durability validation suite has failures.");
    if (!connectivity.ok) blockers.push("Database not healthy.");

    const envConfirmed = process.env.P185_PRODUCTION_STORAGE_CONFIRMED === "1";
    const readyToConfirm =
      blockers.length === 0 &&
      connectivity.ok &&
      schemaVersion === 1 &&
      (input?.validation ? validationOk : false);

    let storageConfirmationStatus: P1855HealthReport["storageConfirmationStatus"] = "not_ready";
    if (envConfirmed && !readyToConfirm) storageConfirmationStatus = "env_set_but_unverified";
    else if (readyToConfirm) storageConfirmationStatus = "ready_to_confirm";

    // Ensure document presence for bridges
    await getDocument(DOC_KEYS.meta, db);

    return {
      phase: P185_5_SOURCE_PHASE,
      generatedAt: new Date().toISOString(),
      adapterType: "postgres",
      providerNameRedacted: redactProviderName(db.provider),
      databaseConnectivity: connectivity.ok,
      schemaVersion,
      migrationStatus: schemaVersion === 1 ? "applied" : "pending",
      queueCount,
      frozenCohortCount,
      leaseHealth,
      transactionCapability: true,
      idempotencyHealth,
      storageConfirmationStatus,
      durable: true,
      blockers,
    };
  } catch (err) {
    return {
      phase: P185_5_SOURCE_PHASE,
      generatedAt: new Date().toISOString(),
      adapterType: "postgres",
      providerNameRedacted: resolveDatabaseUrl() ? "neon_postgres" : "pglite_local",
      databaseConnectivity: false,
      schemaVersion: null,
      migrationStatus: "failed",
      queueCount: null,
      frozenCohortCount: null,
      leaseHealth: "unknown",
      transactionCapability: false,
      idempotencyHealth: false,
      storageConfirmationStatus: "not_ready",
      durable: false,
      blockers: [err instanceof Error ? err.message : String(err)],
    };
  }
}
