import { applyP1861Migrations, getP1861SchemaVersion } from "@/lib/p186-1-lifecycle-state-machine/migrate";
import { LifecycleAuditStore, LifecycleRecordStore } from "@/lib/p186-1-lifecycle-state-machine/stores";
import { loadLatestShadowRun } from "@/lib/p186-1-lifecycle-state-machine/shadowProjection";
import {
  P186_1_SCHEMA_VERSION,
  P186_1_SOURCE_PHASE,
  type P186LifecycleHealthReport,
} from "@/lib/p186-1-lifecycle-state-machine/types";
import { createSqlClient, redactProviderName } from "@/lib/p185-5-vercel-durable-storage/sqlClient";
import type { SqlClient } from "@/lib/p185-5-vercel-durable-storage/types";

export async function buildLifecycleHealthReport(
  client?: SqlClient,
): Promise<P186LifecycleHealthReport> {
  const db = client ?? (await createSqlClient());
  await applyP1861Migrations(db);
  const schemaVersion = (await getP1861SchemaVersion(db)) ?? P186_1_SCHEMA_VERSION;
  const records = new LifecycleRecordStore(db);
  const audit = new LifecycleAuditStore(db);
  const countsByState = await records.countsByState();
  const auditCount = await audit.count();
  const shadow = await loadLatestShadowRun(db);

  const evaluated = shadow?.evaluated ?? 0;
  const matches = shadow?.matches ?? 0;
  const matchRate = evaluated > 0 ? matches / evaluated : null;

  const blockers: string[] = [];
  const warnings: string[] = [];

  if (db.provider === "unconfigured") {
    blockers.push("SQL client unconfigured.");
  }
  if ((shadow?.mismatches ?? 0) > 0) {
    warnings.push(`Shadow mismatches=${shadow?.mismatches}`);
  }
  if ((shadow?.impossibleTransitions ?? 0) > 0) {
    warnings.push(`Impossible transitions=${shadow?.impossibleTransitions}`);
  }
  if (!shadow) {
    warnings.push("No shadow projection run recorded yet.");
  }

  // P186.2 readiness: foundation healthy, shadow run exists, no critical blockers
  const readyForP186_2 =
    blockers.length === 0 &&
    schemaVersion >= 1 &&
    Boolean(shadow) &&
    (shadow?.impossibleTransitions ?? 0) === 0;

  return {
    phase: P186_1_SOURCE_PHASE,
    generatedAt: new Date().toISOString(),
    schemaVersion,
    storage: {
      provider: redactProviderName(db.provider),
      healthy: db.provider !== "unconfigured",
      durable: db.provider === "neon_postgres" || db.provider === "vercel_postgres" || db.provider === "pglite_local",
    },
    countsByState,
    auditCount,
    shadow: {
      lastProjectedAt: shadow?.projectedAt ?? null,
      matches: shadow?.matches ?? 0,
      mismatches: shadow?.mismatches ?? 0,
      duplicateTransitions: shadow?.duplicateTransitions ?? 0,
      invalidTransitions: shadow?.invalidTransitions ?? 0,
      missingTransitions: shadow?.missingTransitions ?? 0,
      impossibleTransitions: shadow?.impossibleTransitions ?? 0,
      matchRate,
    },
    isolation: {
      paperworkSendDisabled: true,
      continuousAutomationDisabled: true,
      liveModeNotEnabledByP186: true,
      p184P185Unmodified: true,
    },
    readyForP186_2,
    blockers,
    warnings,
  };
}
