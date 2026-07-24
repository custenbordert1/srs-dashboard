import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { migrateFrozenRolloutToDurableStore } from "@/lib/p185-5-vercel-durable-storage/migrateFromFs";
import { applyP1855Migrations } from "@/lib/p185-5-vercel-durable-storage/migrate";
import { createSqlClient, resetSqlClientCacheForTests } from "@/lib/p185-5-vercel-durable-storage/sqlClient";
import {
  runP1855DurabilityValidation,
  validationPassed,
} from "@/lib/p185-5-vercel-durable-storage/validation";
import { buildP1855HealthReport } from "@/lib/p185-5-vercel-durable-storage/health";
import { runP1853FinalCohortDryRun } from "@/lib/p185-3-controlled-live-paperwork-rollout/readiness";
import { loadP184EngineState } from "@/lib/p184-autonomous-paperwork-send-engine/store";
import { evaluateProductionStorageGate } from "@/lib/p185-4-configure-production-gates-canary/storageGate";
import { getP185StorageHealth } from "@/lib/p185-production-paperwork-automation-runner";
import { P185_5_SOURCE_PHASE } from "@/lib/p185-5-vercel-durable-storage/types";

export async function runP1855DurableStorageMigration(input?: {
  pgliteDataDir?: string;
  expectedRolloutId?: string;
  skipDryRun?: boolean;
}): Promise<{
  provider: string;
  migration: Awaited<ReturnType<typeof migrateFrozenRolloutToDurableStore>>;
  validation: Awaited<ReturnType<typeof runP1855DurabilityValidation>>;
  health: Awaited<ReturnType<typeof buildP1855HealthReport>>;
  dryRun: Awaited<ReturnType<typeof runP1853FinalCohortDryRun>> | null;
  p184: { enabled: boolean; mode: string };
  storageGate: ReturnType<typeof evaluateProductionStorageGate>;
  schedulerRecommendation: string[];
  remainingCanaryBlockers: string[];
  artifactPaths: string[];
}> {
  if (input?.pgliteDataDir) {
    process.env.P185_PGLITE_DATA_DIR = input.pgliteDataDir;
    process.env.P185_5_FORCE_PGLITE = "1";
  } else if (!process.env.P185_DATABASE_URL && !process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
    // Default local durable path outside repo .data semantics for validation
    const dir = path.join(process.cwd(), ".p1855-pglite");
    process.env.P185_PGLITE_DATA_DIR = dir;
    process.env.P185_5_FORCE_PGLITE = "1";
  }

  await resetSqlClientCacheForTests();
  const client = await createSqlClient({ forceNew: true });
  await applyP1855Migrations(client);

  const migration = await migrateFrozenRolloutToDurableStore({
    client,
    expectedRolloutId: input?.expectedRolloutId ?? "p1853-20260710-b419512d",
  });

  const validation = await runP1855DurabilityValidation({ client });
  const health = await buildP1855HealthReport({ validation });

  // Ensure P184 remains dry_run after migration
  const p184State = await loadP184EngineState();
  const p184ModeBeforeGuard = p184State.config.mode;
  if (p184State.config.mode !== "dry_run") {
    // Do not enable live — force dry_run if somehow changed
    p184State.config.mode = "dry_run";
    const { saveP184EngineState } = await import("@/lib/p184-autonomous-paperwork-send-engine/store");
    await saveP184EngineState(p184State);
  }

  let dryRun: Awaited<ReturnType<typeof runP1853FinalCohortDryRun>> | null = null;
  if (!input?.skipDryRun) {
    dryRun = await runP1853FinalCohortDryRun({ forceRefreeze: false });
  }

  // Validation may have closed the original client during restart tests — reopen.
  const statsClient = await createSqlClient({ forceNew: true });
  const envelopeStats = await statsClient.query(
    `SELECT
       COUNT(*) FILTER (WHERE state IN ('sent_unverified','viewed'))::int AS active,
       COUNT(*) FILTER (WHERE state IN ('confirmed_sent','signed'))::int AS completed
     FROM p185_envelopes`,
  );
  const activeEnvelopes = Number(envelopeStats.rows[0]?.active ?? 0);
  const completedEnvelopes = Number(envelopeStats.rows[0]?.completed ?? 0);

  const storageGate = evaluateProductionStorageGate({ storage: getP185StorageHealth() });

  const remainingCanaryBlockers = [
    ...health.blockers,
    ...storageGate.blockers,
    "P184 mode is dry_run (leave until canary authorization — do not enable now).",
    "Canary not authorized (do not authorize in P185.5).",
    "Vercel Hobby cannot run */10 native cron — use external scheduler or Pro.",
  ];
  void p184ModeBeforeGuard;

  const schedulerRecommendation = [
    "Do not restore */10 in vercel.json on Hobby (once-daily limit only).",
    "Preferred: external/company scheduler every 10 minutes calling POST /api/cron/p185-paperwork-automation with Authorization: Bearer $CRON_SECRET.",
    "Alternative: upgrade to Vercel Pro for native sub-daily cron.",
  ];

  const artifactsDir = path.join(process.cwd(), "artifacts");
  await mkdir(artifactsDir, { recursive: true });
  const summary = {
    phase: P185_5_SOURCE_PHASE,
    generatedAt: new Date().toISOString(),
    provider: client.provider,
    adapter: "postgres",
    schemaVersion: 1,
    migration,
    validation,
    health,
    dryRun: dryRun
      ? {
          frozenSize: dryRun.frozenSize,
          stillEligible: dryRun.stillEligible,
          newlyBlocked: dryRun.newlyBlocked,
          queueDepth: dryRun.queueDepth,
          duplicateProtections: dryRun.duplicateProtections,
          activeEnvelopes,
          completedEnvelopes,
        }
      : null,
    p184: { enabled: p184State.config.enabled, mode: p184State.config.mode },
    storageConfirmationReadiness: health.storageConfirmationStatus,
    schedulerRecommendation,
    remainingCanaryBlockers,
    note: "P185_PRODUCTION_STORAGE_CONFIRMED was NOT set automatically.",
  };

  const summaryPath = path.join(artifactsDir, "p185-5-durable-storage-migration.json");
  const mdPath = path.join(artifactsDir, "p185-5-durable-storage-migration.md");
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  await writeFile(
    mdPath,
    [
      `# P185.5 Durable Storage Migration`,
      ``,
      `Provider: **${client.provider}**`,
      `Adapter: **postgres**`,
      `Migration OK: **${migration.ok}**`,
      `Validation OK: **${validationPassed(validation)}**`,
      `Queue: ${migration.before.queueDepth} → ${migration.after.queueDepth}`,
      `Cohort: ${migration.before.frozenCohort} → ${migration.after.frozenCohort}`,
      `Storage confirmation: **${health.storageConfirmationStatus}** (env not auto-set)`,
      `P184: enabled=${p184State.config.enabled} mode=${p184State.config.mode}`,
      ``,
      `## Scheduler`,
      ...schedulerRecommendation.map((s) => `- ${s}`),
      ``,
      `## Remaining canary blockers`,
      ...remainingCanaryBlockers.map((b) => `- ${b}`),
      ``,
    ].join("\n"),
    "utf8",
  );

  try {
    await statsClient.close();
  } catch {
    // ignore
  }
  try {
    await client.close();
  } catch {
    // ignore
  }

  return {
    provider: client.provider,
    migration,
    validation,
    health,
    dryRun,
    p184: { enabled: p184State.config.enabled, mode: p184State.config.mode },
    storageGate,
    schedulerRecommendation,
    remainingCanaryBlockers,
    artifactPaths: [summaryPath, mdPath],
  };
}
