/**
 * P136 — Autonomous Paperwork Operations Scheduler
 * Usage: npx tsx scripts/p136-autonomous-paperwork-scheduler.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildAutonomousPaperworkSchedulerReport,
  runSchedulerCycle,
} from "@/lib/p136-autonomous-paperwork-scheduler";

async function main() {
  const cycle = await runSchedulerCycle({ mode: "oneCycle", maxRemediationCandidates: 15, skipOpsCenter: false });
  const report = await buildAutonomousPaperworkSchedulerReport({ lastCycle: cycle });
  const artifactPath = path.join(process.cwd(), "artifacts", "p136-autonomous-paperwork-scheduler.json");
  await mkdir(path.dirname(artifactPath), { recursive: true });

  const artifact = {
    sourcePhase: report.sourcePhase,
    generatedAt: report.generatedAt,
    mode: report.mode,
    state: report.state,
    heartbeat: report.heartbeat,
    runtimeMs: report.runtimeMs,
    lastCycle: cycle,
    executivePanel: report.executivePanel,
    goNoGo: report.goNoGo,
    goNoGoReason: report.goNoGoReason,
    executeBatchCalled: report.executeBatchCalled,
    breezyWrites: report.breezyWrites,
    liveModeEnabled: report.liveModeEnabled,
    paperworkSent: report.paperworkSent,
  };

  await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        ok: true,
        artifactPath,
        phasesCompleted: cycle.phasesCompleted.length,
        autoApproved: cycle.metrics.autoApproved,
        remediationsExecuted: cycle.metrics.remediationsExecuted,
        queueSize: cycle.metrics.queueSize,
        goNoGo: report.goNoGo,
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
