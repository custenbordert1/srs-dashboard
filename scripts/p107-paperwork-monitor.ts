/**
 * P107 — Paperwork Monitor
 * Usage:
 *   npx tsx scripts/p107-paperwork-monitor.ts
 *   npx tsx scripts/p107-paperwork-monitor.ts --mode=runOnce
 *   npx tsx scripts/p107-paperwork-monitor.ts --validate-live
 *   npx tsx scripts/p107-paperwork-monitor.ts --scheduled
 */
import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  P107_DEV_INTERVAL_MS,
  runPaperworkMonitorCycle,
  startPaperworkMonitor,
  validateP107LiveCohort,
  type PaperworkMonitorMode,
} from "@/lib/paperwork-monitor";

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

function parseMode(): PaperworkMonitorMode {
  const arg = process.argv.find((a) => a.startsWith("--mode="));
  const value = arg?.split("=")[1] ?? "dryRun";
  if (value === "runOnce" || value === "scheduled") return value;
  return "dryRun";
}

async function main() {
  loadEnvLocal();

  if (process.argv.includes("--validate-live")) {
    const validation = await validateP107LiveCohort({ dryRun: !process.argv.includes("--live") });
    const outPath = path.join(process.cwd(), "artifacts/p107-live-cohort-validation.json");
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, `${JSON.stringify(validation, null, 2)}\n`, "utf8");
    console.log(JSON.stringify({ ...validation, artifactPath: outPath }, null, 2));
    return;
  }

  const scheduled = process.argv.includes("--scheduled");
  const mode = parseMode();

  if (scheduled) {
    await startPaperworkMonitor();
    const intervalMs = Number(process.env.PAPERWORK_MONITOR_INTERVAL_MS) || P107_DEV_INTERVAL_MS;
    console.error(`[P107] Scheduled — every ${intervalMs / 1000}s`);
    const tick = async () => {
      const result = await runPaperworkMonitorCycle({ mode: "runOnce", byUserId: "p107-script" });
      console.error(`[P107] synced=${result.report.metrics.syncedThisCycle} errors=${result.report.metrics.errorsThisCycle}`);
    };
    await tick();
    setInterval(() => void tick(), intervalMs);
    return;
  }

  console.error(`[P107] Mode: ${mode}`);
  const result = await runPaperworkMonitorCycle({ mode, byUserId: "p107-script" });
  const outDir = path.join(process.cwd(), ".data");
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, `p107-paperwork-monitor-${mode}.json`);
  await writeFile(outPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        ok: result.ok,
        mode: result.mode,
        metrics: result.report.metrics,
        candidates: result.report.candidates.map((c) => ({
          name: c.candidateName,
          dropbox: c.dropboxStatus,
          workflow: c.workflowStatus,
          error: c.error,
        })),
        artifactPath: outPath,
        warnings: result.warnings,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
