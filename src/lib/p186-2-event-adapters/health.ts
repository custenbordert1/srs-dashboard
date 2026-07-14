import { applyP1862Migrations } from "@/lib/p186-2-event-adapters/migrate";
import { readP1862Flags } from "@/lib/p186-2-event-adapters/flags";
import {
  P186_2_SOURCE_PHASE,
  type P1862HealthReport,
} from "@/lib/p186-2-event-adapters/types";
import { createSqlClient, redactProviderName } from "@/lib/p185-5-vercel-durable-storage/sqlClient";
import type { SqlClient } from "@/lib/p185-5-vercel-durable-storage/types";

export async function buildP1862HealthReport(
  client?: SqlClient,
): Promise<P1862HealthReport> {
  const db = client ?? (await createSqlClient());
  await applyP1862Migrations(db);
  const flags = readP1862Flags();

  const inbox = await db.query(
    `SELECT disposition, COUNT(*)::int AS n FROM p186_event_inbox GROUP BY disposition`,
  );
  const byDisp = Object.fromEntries(
    inbox.rows.map((r) => [String(r.disposition), Number(r.n)]),
  );
  const received = Object.values(byDisp).reduce((a, b) => a + b, 0);

  const cmp = await db.query(
    `SELECT comparison, COUNT(*)::int AS n FROM p186_ingest_comparisons GROUP BY comparison`,
  );
  const byCmp = Object.fromEntries(
    cmp.rows.map((r) => [String(r.comparison), Number(r.n)]),
  );

  const lagRows = await db.query(
    `SELECT source_system,
            MAX(source_timestamp) AS last_at
     FROM p186_event_inbox
     GROUP BY source_system`,
  );
  const now = Date.now();
  const sourceLag: P1862HealthReport["sourceLag"] = {};
  for (const row of lagRows.rows) {
    const last = row.last_at ? new Date(String(row.last_at)).toISOString() : null;
    sourceLag[String(row.source_system)] = {
      lastEventAt: last,
      lagMs: last ? Math.max(0, now - Date.parse(last)) : null,
    };
  }

  const recon = await db.query(
    `SELECT run_at, findings, payload FROM p186_reconciliation_runs ORDER BY run_at DESC LIMIT 1`,
  );
  const reconRow = recon.rows[0];
  const reconPayload =
    reconRow?.payload && typeof reconRow.payload === "object"
      ? (reconRow.payload as { byKind?: Record<string, number> })
      : {};

  const blockers: string[] = [];
  const warnings: string[] = [];
  if (db.provider === "unconfigured") blockers.push("SQL unconfigured");
  if ((byCmp.mismatch ?? 0) > 0) warnings.push(`shadow mismatches=${byCmp.mismatch}`);
  if ((byDisp.ingestion_failure ?? 0) > 0) {
    warnings.push(`ingestion failures=${byDisp.ingestion_failure}`);
  }

  const readyForP186_3 =
    blockers.length === 0 &&
    received > 0 &&
    (byDisp.ingestion_failure ?? 0) === 0 &&
    (byCmp.impossible_transition ?? 0) === 0;

  return {
    phase: P186_2_SOURCE_PHASE,
    generatedAt: new Date().toISOString(),
    flags: { ...flags },
    storage: {
      provider: redactProviderName(db.provider),
      healthy: db.provider !== "unconfigured",
      durable:
        db.provider === "neon_postgres" ||
        db.provider === "vercel_postgres" ||
        db.provider === "pglite_local",
    },
    ingestion: {
      received,
      accepted: (byDisp.accepted ?? 0) + (byDisp.match ?? 0),
      duplicates: byDisp.duplicate ?? 0,
      invalid:
        (byDisp.invalid_transition ?? 0) +
        (byDisp.rejected_malformed ?? 0),
      outOfOrder: (byDisp.out_of_order ?? 0) + (byDisp.late ?? 0),
      late: byDisp.late ?? 0,
      failures: byDisp.ingestion_failure ?? 0,
      unmapped: byDisp.unmapped ?? 0,
    },
    shadow: {
      matches: byCmp.match ?? 0,
      mismatches: byCmp.mismatch ?? 0,
      impossibleTransitions: byCmp.impossible_transition ?? 0,
      conflictingSourceState: byCmp.conflicting_source_state ?? 0,
    },
    reconciliation: {
      lastRunAt: reconRow?.run_at
        ? new Date(String(reconRow.run_at)).toISOString()
        : null,
      findings: Number(reconRow?.findings ?? 0),
      byKind: reconPayload.byKind ?? {},
    },
    sourceLag,
    isolation: {
      paperworkSendDisabled: true,
      continuousAutomationDisabled: true,
      liveModeNotEnabledByP186: true,
      p184P185Unmodified: true,
      authoritativeModeDisabled: true,
    },
    readyForP186_3,
    blockers,
    warnings,
  };
}
