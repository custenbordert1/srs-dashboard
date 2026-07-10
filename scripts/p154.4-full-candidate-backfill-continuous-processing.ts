/**
 * P154.4 — Full candidate backfill and continuous processing
 *
 * Usage:
 *   npx tsx scripts/p154.4-full-candidate-backfill-continuous-processing.ts
 *   npx tsx scripts/p154.4-full-candidate-backfill-continuous-processing.ts --live
 *   npx tsx scripts/p154.4-full-candidate-backfill-continuous-processing.ts --continuous
 */
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  executeP1544BackfillContinuousCycle,
  formatP1544BackfillContinuousMarkdown,
  startP1544ContinuousProcessing,
} from "@/lib/p154-full-candidate-backfill-continuous-processing";

const SESSION = {
  userId: "p154.4-backfill-continuous",
  email: "p154.4@local",
  name: "P154.4 Backfill Continuous",
  role: "executive" as const,
  territoryStates: [],
  expiresAt: new Date(Date.now() + 7200_000).toISOString(),
};

function loadEnvLocal(): void {
  try {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq <= 0) continue;
      let v = t.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      process.env[t.slice(0, eq).trim()] = v;
    }
  } catch {
    // ignore
  }
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

async function writeArtifacts(report: Awaited<ReturnType<typeof executeP1544BackfillContinuousCycle>>) {
  const jsonPath = path.join(
    process.cwd(),
    "artifacts",
    "p154.4-full-candidate-backfill-continuous-processing.json",
  );
  const mdPath = path.join(
    process.cwd(),
    "artifacts",
    "p154.4-full-candidate-backfill-continuous-processing.md",
  );
  await mkdir(path.dirname(jsonPath), { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(mdPath, formatP1544BackfillContinuousMarkdown(report), "utf8");
  return { jsonPath, mdPath };
}

async function main() {
  loadEnvLocal();

  process.env.P154_CONTINUOUS_ENABLED = process.env.P154_CONTINUOUS_ENABLED ?? "false";
  process.env.P154_INTERVAL_MINUTES = process.env.P154_INTERVAL_MINUTES ?? "10";
  process.env.P154_MAX_ASSIGNMENTS_PER_CYCLE =
    process.env.P154_MAX_ASSIGNMENTS_PER_CYCLE ?? "25";
  process.env.P154_MAX_PAPERWORK_SENDS_PER_CYCLE =
    process.env.P154_MAX_PAPERWORK_SENDS_PER_CYCLE ?? "10";
  process.env.P154_BACKFILL_SINCE = process.env.P154_BACKFILL_SINCE ?? "2026-06-01";

  const live = hasFlag("--live");
  const continuous = hasFlag("--continuous");

  console.error("[P154.4] Phase 1 — dry run (full backfill + classification + capped cycle)…");
  const dryRunReport = await executeP1544BackfillContinuousCycle({
    session: SESSION,
    dryRun: true,
    fullBackfill: true,
    userId: SESSION.userId,
  });

  const dryClean =
    !dryRunReport.skippedOverlap &&
    (dryRunReport.controlledCycle?.cycle.failures ?? 0) === 0 &&
    !(dryRunReport.controlledCycle?.cycle.stoppedOnError ?? false);

  let finalReport = dryRunReport;

  if (live && dryClean) {
    console.error("[P154.4] Dry run clean — running one live capped cycle…");
    finalReport = await executeP1544BackfillContinuousCycle({
      session: SESSION,
      dryRun: false,
      fullBackfill: false,
      userId: SESSION.userId,
    });
  } else if (live && !dryClean) {
    console.error("[P154.4] Dry run not clean — skipping live cycle.");
  }

  const artifacts = await writeArtifacts(finalReport);

  if (continuous && process.env.P154_CONTINUOUS_ENABLED === "true") {
    console.error("[P154.4] Starting continuous mode…");
    await startP1544ContinuousProcessing({
      session: SESSION,
      dryRun: !live,
      userId: SESSION.userId,
    });
  }

  console.log(
    JSON.stringify(
      {
        ok: dryClean && (!live || (finalReport.controlledCycle?.cycle.failures ?? 0) === 0),
        dryRunClean: dryClean,
        liveExecuted: live && dryClean,
        artifacts,
        backfill: finalReport.backfill,
        classification: {
          totalClassified: finalReport.classification.totalClassified,
          buckets: finalReport.classification.buckets,
        },
        cycle: finalReport.controlledCycle?.cycle ?? null,
        dashboard: finalReport.dashboard,
      },
      null,
      2,
    ),
  );

  if (!dryClean) process.exit(1);
  if (live && (finalReport.controlledCycle?.cycle.failures ?? 0) > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
