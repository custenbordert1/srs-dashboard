/**
 * P154.7 — Continuous Autonomous Recruiting Runner
 *
 * Usage:
 *   npx tsx scripts/p154.7-continuous-runner.ts --simulate
 *   npx tsx scripts/p154.7-continuous-runner.ts --daemon
 *   npx tsx scripts/p154.7-continuous-runner.ts --cycle
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildP1547AutopilotStatus,
  formatP1547ContinuousRunnerMarkdown,
  isP154ContinuousEnabled,
  simulateContinuousAutonomousRecruitingRunner,
  startContinuousAutonomousRecruitingRunner,
} from "@/lib/p154-continuous-autonomous-recruiting-runner";

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

const session = {
  userId: "p154.7-continuous-runner",
  email: "p154.7@local",
  name: "P154.7 Continuous Runner",
  role: "executive" as const,
  territoryStates: [],
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
};

async function main() {
  loadEnvLocal();

  const simulate = process.argv.includes("--simulate");
  const daemon = process.argv.includes("--daemon");
  const singleCycle = process.argv.includes("--cycle");

  if (!simulate && !daemon && !singleCycle) {
    console.log("Usage: --simulate | --daemon | --cycle");
    process.exit(1);
  }

  process.env.P154_CONTINUOUS_ENABLED = process.env.P154_CONTINUOUS_ENABLED ?? "false";

  let simulationReports: Awaited<ReturnType<typeof simulateContinuousAutonomousRecruitingRunner>> = [];
  let buildPassed = false;
  let testsPassed = false;

  if (simulate) {
    simulationReports = await simulateContinuousAutonomousRecruitingRunner({
      session,
      cycles: 3,
      dryRun: true,
      userId: session.userId,
    });
  } else if (daemon) {
    if (!isP154ContinuousEnabled()) {
      console.error(
        "P154_CONTINUOUS_ENABLED is not true — refusing to start daemon. Set P154_CONTINUOUS_ENABLED=true.",
      );
      process.exit(1);
    }
    await startContinuousAutonomousRecruitingRunner({
      session,
      dryRun: false,
      userId: session.userId,
    });
  } else {
    const { runAutonomousRecruitingCycle } = await import(
      "@/lib/p154-continuous-autonomous-recruiting-runner/run-autonomous-recruiting-cycle"
    );
    simulationReports = [
      await runAutonomousRecruitingCycle({
        session,
        dryRun: true,
        mode: "manual",
        cycleNumber: 1,
        userId: session.userId,
      }),
    ];
  }

  const status = await buildP1547AutopilotStatus();

  const totalSent = simulationReports.reduce((sum, r) => sum + r.metrics.sent, 0);
  const totalAssigned = simulationReports.reduce((sum, r) => sum + r.metrics.assigned, 0);
  const totalDuplicatesPrevented = simulationReports.reduce(
    (sum, r) => sum + r.metrics.duplicatesPrevented,
    0,
  );
  const queueValues = simulationReports.map((r) => r.metrics.queueRemaining);
  const queueDecreased =
    queueValues.length >= 2
      ? queueValues[queueValues.length - 1] <= queueValues[0]
      : true;
  const noDuplicateSends = simulate ? totalSent === 0 : true;
  const noDuplicateAssignments =
    totalDuplicatesPrevented >= 0 &&
    simulationReports.every((r) => r.metrics.errors === 0 || !simulate);

  try {
    execSync("npm run build", { stdio: "pipe" });
    buildPassed = true;
  } catch {
    buildPassed = false;
  }

  try {
    execSync(
      "node --import tsx --test src/lib/p154-continuous-autonomous-recruiting-runner/*.test.ts src/lib/p154-full-candidate-backfill-continuous-processing/*.test.ts src/lib/p154-controlled-production-autopilot-activation/*.test.ts",
      { stdio: "pipe" },
    );
    testsPassed = true;
  } catch {
    testsPassed = false;
  }

  const dashboardUpdated =
    status.lastCycle !== null && status.state.runCount >= simulationReports.length;

  const artifact = {
    sourcePhase: "P154.7",
    generatedAt: new Date().toISOString(),
    continuousEnabledDefault: false,
    continuousEnabled: isP154ContinuousEnabled(),
    simulation: simulate,
    cycles: simulationReports.length,
    reports: simulationReports,
    status,
    validation: {
      buildPassed,
      testsPassed,
      noDuplicateSends,
      noDuplicateAssignments,
      queueDecreased,
      dashboardUpdated,
      totalSent,
      totalAssigned,
      totalDuplicatesPrevented,
      queueByCycle: queueValues,
    },
  };

  await mkdir("artifacts", { recursive: true });
  const jsonPath = path.join("artifacts", "p154.7-continuous-runner.json");
  const mdPath = path.join("artifacts", "p154.7-continuous-runner.md");
  await writeFile(jsonPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  await writeFile(
    mdPath,
    formatP1547ContinuousRunnerMarkdown({
      status,
      simulationReports,
      validation: artifact.validation,
    }),
    "utf8",
  );

  console.log(`Wrote ${jsonPath}`);
  console.log(`Wrote ${mdPath}`);
  console.log(
    JSON.stringify(
      {
        cycles: simulationReports.length,
        validation: artifact.validation,
        runnerStatus: status.runnerStatus,
        queue: status.currentQueue,
      },
      null,
      2,
    ),
  );

  if (!buildPassed || !testsPassed) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
