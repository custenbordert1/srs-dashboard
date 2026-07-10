/**
 * P185.5 — Migrate frozen rollout to durable Postgres/PGlite.
 * Does not send paperwork. Does not enable live mode. Does not authorize canary.
 */
import path from "node:path";
import { runP1855DurableStorageMigration } from "../src/lib/p185-5-vercel-durable-storage";

function loadEnvLocal(): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("node:fs") as typeof import("node:fs");
    const raw = fs.readFileSync(".env.local", "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    // optional
  }
}

async function main(): Promise<void> {
  loadEnvLocal();
  const pgliteDataDir =
    process.env.P185_PGLITE_DATA_DIR?.trim() ||
    (!process.env.P185_DATABASE_URL &&
    !process.env.DATABASE_URL &&
    !process.env.POSTGRES_URL
      ? path.join(process.cwd(), ".p1855-pglite")
      : undefined);

  console.log("P185.5 — durable storage migration (no sends, dry_run only)…");
  const result = await runP1855DurableStorageMigration({
    pgliteDataDir,
    expectedRolloutId: "p1853-20260710-b419512d",
  });

  console.log(
    JSON.stringify(
      {
        provider: result.provider,
        migrationOk: result.migration.ok,
        queueBefore: result.migration.before.queueDepth,
        queueAfter: result.migration.after.queueDepth,
        cohortBefore: result.migration.before.frozenCohort,
        cohortAfter: result.migration.after.frozenCohort,
        validation: result.validation,
        health: {
          adapterType: result.health.adapterType,
          provider: result.health.providerNameRedacted,
          connectivity: result.health.databaseConnectivity,
          schemaVersion: result.health.schemaVersion,
          migrationStatus: result.health.migrationStatus,
          queueCount: result.health.queueCount,
          frozenCohortCount: result.health.frozenCohortCount,
          storageConfirmationStatus: result.health.storageConfirmationStatus,
        },
        dryRun: result.dryRun
          ? {
              frozen: result.dryRun.frozenSize,
              eligible: result.dryRun.stillEligible,
              newlyBlocked: result.dryRun.newlyBlocked,
              queueDepth: result.dryRun.queueDepth,
            }
          : null,
        p184: result.p184,
        remainingCanaryBlockers: result.remainingCanaryBlockers,
        schedulerRecommendation: result.schedulerRecommendation,
        artifacts: result.artifactPaths,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
