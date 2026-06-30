/**
 * P106.1 — Autonomous Paperwork Runner
 * Usage:
 *   npx tsx scripts/p1061-autonomous-paperwork-runner.ts
 *   npx tsx scripts/p1061-autonomous-paperwork-runner.ts --mode=runOnce
 *   npx tsx scripts/p1061-autonomous-paperwork-runner.ts --mode=fullReconciliation
 *   npx tsx scripts/p1061-autonomous-paperwork-runner.ts --scheduled
 */
import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  P106_1_DEV_INTERVAL_MS,
  runAutonomousPaperworkRunnerCycle,
  startAutonomousPaperworkRunner,
  type AutonomousPaperworkRunnerMode,
} from "@/lib/autonomous-paperwork-runner";

function loadEnvLocal(): void {
  try {
    const envPath = path.resolve(".env.local");
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // use process env
  }
}

function parseMode(): AutonomousPaperworkRunnerMode {
  const arg = process.argv.find((a) => a.startsWith("--mode="));
  const value = arg?.split("=")[1] ?? "dryRun";
  if (value === "runOnce" || value === "scheduled" || value === "fullReconciliation") return value;
  return "dryRun";
}

async function runCycle(mode: AutonomousPaperworkRunnerMode) {
  const result = await runAutonomousPaperworkRunnerCycle({
    mode,
    mtdOnly: mode !== "fullReconciliation",
    skipBreezySync: process.argv.includes("--skip-sync"),
    byUserId: "p1061-script",
  });

  const outDir = path.join(process.cwd(), ".data");
  await mkdir(outDir, { recursive: true });
  const suffix = mode === "fullReconciliation" ? "full-reconciliation" : mode;
  const outPath = path.join(outDir, `p1061-autonomous-paperwork-runner-${suffix}.json`);
  await writeFile(outPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");

  const artifactDir = path.join(process.cwd(), "artifacts");
  await mkdir(artifactDir, { recursive: true });
  if (mode === "dryRun") {
    await writeFile(
      path.join(artifactDir, "p1061-autonomous-paperwork-runner-dryrun.json"),
      `${JSON.stringify(result.report, null, 2)}\n`,
      "utf8",
    );
  }

  console.log(
    JSON.stringify(
      {
        ok: result.ok,
        skippedOverlap: result.skippedOverlap,
        mode: result.mode,
        metrics: result.report.metrics,
        runnerStatus: result.report.state.runnerStatus,
        blockedRegistryCount: Object.keys(result.report.state.blockedRegistry).length,
        artifactPath: outPath,
        warnings: result.warnings,
      },
      null,
      2,
    ),
  );
}

async function main() {
  loadEnvLocal();
  const mode = parseMode();
  const scheduled = process.argv.includes("--scheduled");

  if (scheduled) {
    await startAutonomousPaperworkRunner({ explicit: true });
    const intervalMs = Number(process.env.AUTONOMOUS_PAPERWORK_RUNNER_INTERVAL_MS) || P106_1_DEV_INTERVAL_MS;
    console.error(`[P106.1] Scheduled mode — every ${intervalMs / 1000}s (dryRun + executeOne per policy)`);
    await runCycle("dryRun");
    setInterval(() => {
      void runCycle("runOnce").catch((error) => {
        console.error(error instanceof Error ? error.message : error);
      });
    }, intervalMs);
    return;
  }

  console.error(`[P106.1] Mode: ${mode}`);
  await runCycle(mode);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
