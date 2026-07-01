/**
 * P125 — Autonomous Paperwork Production Runner
 * Usage: npx tsx scripts/p125-autonomous-paperwork-production-runner.ts [--continuous]
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildProductionRunnerSnapshot,
  loadProductionRunnerState,
  runProductionRunnerCycle,
  startProductionRunner,
} from "@/lib/p125-autonomous-paperwork-production-runner";
import { resolveProductionRunnerConfig } from "@/lib/p125-autonomous-paperwork-production-runner/runner-config";

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const continuous = process.argv.includes("--continuous");
  const config = resolveProductionRunnerConfig();

  if (continuous) {
    await startProductionRunner({ mode: "continuous", intervalMs: config.scheduleIntervalMs });
  }

  const cycle = await runProductionRunnerCycle({
    mode: continuous ? "continuous" : "oneCycle",
  });
  const snapshot = await buildProductionRunnerSnapshot({ lastCycle: cycle.snapshot.lastCycle });
  const state = await loadProductionRunnerState();

  const artifact = {
    architecture: {
      pipeline: [
        "AUTO_APPROVED",
        "Safety Gates",
        "P122 executeOne",
        "Dropbox Sign",
        "Audit",
        "Onboarding",
      ],
      modules: ["P124 approval", "P123 orchestrator", "P122 executeOne", "P125 runner"],
      executeBatch: false,
      maxConcurrentSends: 1,
    },
    runnerStates: ["stopped", "idle", "running", "paused"],
    scheduler: {
      modes: ["manual", "oneCycle", "continuous", "paused", "stopped"],
      continuousEnabled: state.continuousEnabled,
      intervalMs: state.scheduleIntervalMs,
      nextScheduledRunAt: state.nextScheduledRunAt,
    },
    monitoring: {
      heartbeat: snapshot.heartbeat,
      safetyStatus: snapshot.safetyStatus,
      queueDepth: snapshot.metrics.queueDepth,
      retryQueueDepth: snapshot.metrics.retryQueueDepth,
    },
    metrics: snapshot.metrics,
    recoveryStrategy: {
      staleLockRecovery: true,
      exponentialRetry: true,
      duplicatePrevention: true,
      auditLogging: true,
    },
    safetyConfirmation: {
      p122GatesRequired: true,
      p124AutoApprovedOnly: true,
      executeBatchNeverUsed: true,
      liveExecutionEnabled: config.liveExecutionEnabled,
    },
    lastCycle: {
      ok: cycle.ok,
      skippedOverlap: cycle.skippedOverlap,
      warnings: cycle.warnings,
    },
    generatedAt: new Date().toISOString(),
    sourcePhase: "P125",
  };

  const artifactPath = path.join(process.cwd(), "artifacts", "p125-autonomous-paperwork-runner.json");
  await mkdir(path.dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        ok: cycle.ok,
        artifactPath,
        status: snapshot.status,
        queueDepth: snapshot.metrics.queueDepth,
        executeBatchCalled: false,
      },
      null,
      2,
    ),
  );

  if (continuous && state.continuousEnabled) {
    while (true) {
      await sleep(state.scheduleIntervalMs);
      const stateNow = await loadProductionRunnerState();
      if (stateNow.schedulerMode === "stopped" || stateNow.schedulerMode === "paused") break;
      await runProductionRunnerCycle({ mode: "continuous" });
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
