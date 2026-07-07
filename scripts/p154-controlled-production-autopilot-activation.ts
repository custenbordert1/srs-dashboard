/**
 * P154 — Controlled Production Autopilot Activation
 *
 * Usage:
 *   npx tsx scripts/p154-controlled-production-autopilot-activation.ts
 *   npx tsx scripts/p154-controlled-production-autopilot-activation.ts --live
 */
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  executeControlledProductionAutopilot,
  formatP154ProductionAutopilotMarkdown,
  getP154MaxAssignmentsPerCycle,
  getP154MaxSendsPerCycle,
  isP154ControlledProductionAutopilotEnabled,
  loadAutopilotState,
} from "@/lib/p154-controlled-production-autopilot-activation";

function loadEnvLocal(): void {
  try {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq <= 0) continue;
      let v = t.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      process.env[t.slice(0, eq).trim()] = v;
    }
  } catch {
    // ignore
  }
}

const session = {
  userId: "p154-production-autopilot",
  email: "p154@local",
  name: "P154 Production Autopilot",
  role: "executive" as const,
  territoryStates: [],
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
};

async function main() {
  loadEnvLocal();

  const liveFlag = process.argv.includes("--live");
  if (liveFlag && !isP154ControlledProductionAutopilotEnabled()) {
    process.env.P154_CONTROLLED_PRODUCTION_AUTOPILOT_ENABLED = "true";
    process.env.P151_AUTONOMOUS_ADVANCEMENT_ENABLED = "true";
    process.env.P152_IMMEDIATE_PAPERWORK_ENABLED = "true";
  }

  process.env.P154_MAX_RECRUITER_ASSIGNMENTS_PER_CYCLE = String(getP154MaxAssignmentsPerCycle());
  process.env.P154_MAX_PAPERWORK_SENDS_PER_CYCLE = String(getP154MaxSendsPerCycle());
  process.env.P151_MAX_ASSIGNMENTS_PER_CYCLE = String(getP154MaxAssignmentsPerCycle());
  process.env.P152_MAX_SENDS_PER_CYCLE = String(getP154MaxSendsPerCycle());

  const dryRun = !liveFlag;
  console.error(
    `[P154] Starting ${dryRun ? "health check + dry-run cycle" : "controlled live production cycle"} ` +
      `(assignments≤${getP154MaxAssignmentsPerCycle()}, sends≤${getP154MaxSendsPerCycle()})…`,
  );

  const report = await executeControlledProductionAutopilot({ session, dryRun });
  const state = await loadAutopilotState();

  const jsonPath = path.join(process.cwd(), "artifacts", "p154-production-autopilot-activation.json");
  const mdPath = path.join(process.cwd(), "artifacts", "p154-production-autopilot-activation.md");
  await mkdir(path.dirname(jsonPath), { recursive: true });
  await writeFile(
    jsonPath,
    `${JSON.stringify({ report, autopilotState: state }, null, 2)}\n`,
    "utf8",
  );
  await writeFile(mdPath, formatP154ProductionAutopilotMarkdown(report), "utf8");

  console.log(
    JSON.stringify(
      {
        ok: report.health.healthy && report.cycle.failures === 0 && !report.cycle.stoppedOnError,
        jsonPath,
        mdPath,
        dryRun: report.dryRun,
        autopilotEnabled: report.autopilotEnabled,
        paused: report.paused,
        health: report.health.overallStatus,
        candidatesEvaluated: report.cycle.candidatesEvaluated,
        recruitersAssigned: report.cycle.recruitersAssigned,
        paperworkSent: report.cycle.paperworkSent,
        paperworkSkipped: report.cycle.paperworkSkipped,
        duplicatesPrevented: report.cycle.duplicatesPrevented,
        failures: report.cycle.failures,
        executionTimeMs: report.cycle.executionTimeMs,
        queueRemaining: report.cycle.queueRemaining,
        dashboard: report.dashboard,
        rollbackRecommendation: report.rollbackRecommendation,
      },
      null,
      2,
    ),
  );

  if (!report.health.healthy || (report.cycle.stoppedOnError && report.cycle.failures > 0)) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
