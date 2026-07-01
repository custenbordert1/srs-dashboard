/**
 * P126 — Autonomous Operations Command Center
 * Usage: npx tsx scripts/p126-autonomous-operations-command-center.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildOperationsCommandCenterReport } from "@/lib/p126-autonomous-operations-command-center";

async function main() {
  const report = await buildOperationsCommandCenterReport({ filters: { timeRange: "today" }, refresh: true });

  const artifact = {
    architecture: {
      modules: ["P122 executeOne", "P123 orchestrator", "P124 approval", "P125 runner", "P126 command center"],
      pipeline: "AUTO_APPROVED → Safety → executeOne → Dropbox Sign → Audit → Onboarding",
      executeBatch: false,
    },
    panels: [
      "Runner Status",
      "Queue Summary",
      "Live Activity Timeline",
      "Candidate Drilldown",
      "Runner Controls",
      "Health Dashboard",
      "Executive Metrics",
      "Diagnostics",
    ],
    metrics: report.metrics,
    filters: ["today", "yesterday", "last7days", "lastHour", "candidate", "status", "approvalDecision", "failureReason", "errorsOnly"],
    healthIndicators: report.health,
    apis: [
      "GET /api/autonomous-operations-center?scope=paperwork",
      "GET /api/autonomous-operations-command-center",
      "POST /api/autonomous-paperwork-runner/run-once",
      "POST /api/autonomous-paperwork-runner/pause",
      "POST /api/autonomous-paperwork-runner/resume",
      "POST /api/autonomous-paperwork-runner/stop",
    ],
    safetyConfirmation: report.safetyConfirmation,
    queue: report.queue,
    runner: report.runner,
    generatedAt: report.generatedAt,
    sourcePhase: report.sourcePhase,
  };

  const artifactPath = path.join(process.cwd(), "artifacts", "p126-autonomous-operations-command-center.json");
  await mkdir(path.dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        ok: true,
        artifactPath,
        queueDepth: report.metrics.currentQueue,
        todaysSends: report.metrics.todaysSends,
        executeBatchCalled: false,
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
