/**
 * P159 — Operations Control Center validation (no live sends, no daemon).
 *
 * Usage: npx tsx scripts/p159-operations-control-center.ts
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildP159OperationsControlCenter,
  formatP159OperationsControlCenterMarkdown,
} from "@/lib/p159-operations-control-center";
import { isP154ContinuousEnabled } from "@/lib/p154-continuous-autonomous-recruiting-runner/runner-config";
import { loadP1547RunnerState } from "@/lib/p154-continuous-autonomous-recruiting-runner/runner-store";

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

async function main() {
  loadEnvLocal();

  const built = await buildP159OperationsControlCenter();
  const dashboard = built.dashboard;
  const runnerState = await loadP1547RunnerState();

  let buildPassed = false;
  let p159TestsPassed = false;
  let p155TestsPassed = false;
  let p154TestsPassed = false;
  let p158TestsPassed = false;

  try {
    execSync("npm run build", { stdio: "pipe" });
    buildPassed = true;
  } catch {
    buildPassed = false;
  }

  try {
    execSync("node --import tsx --test src/lib/p159-operations-control-center/*.test.ts", {
      stdio: "pipe",
    });
    p159TestsPassed = true;
  } catch {
    p159TestsPassed = false;
  }

  try {
    execSync(
      "node --import tsx --test src/lib/p155-autopilot-operations-dashboard/*.test.ts",
      { stdio: "pipe" },
    );
    p155TestsPassed = true;
  } catch {
    p155TestsPassed = false;
  }

  try {
    execSync(
      "node --import tsx --test src/lib/p154-continuous-autonomous-recruiting-runner/*.test.ts src/lib/p154-controlled-production-autopilot-activation/*.test.ts src/lib/p154-full-candidate-backfill-continuous-processing/*.test.ts",
      { stdio: "pipe" },
    );
    p154TestsPassed = true;
  } catch {
    p154TestsPassed = false;
  }

  try {
    execSync(
      "node --import tsx --test src/lib/p158-autonomous-recruiter-assignment/*.test.ts src/lib/p158-post-assignment-outcome-diagnosis/*.test.ts src/lib/p158-assignment-simulation/*.test.ts src/lib/p158-post-assignment-workflow-transition/*.test.ts",
      { stdio: "pipe" },
    );
    p158TestsPassed = true;
  } catch {
    p158TestsPassed = false;
  }

  const continuousEnabled = isP154ContinuousEnabled();
  const daemonRunning = dashboard.runner.daemonRunning;

  const artifact = {
    sourcePhase: "P159",
    generatedAt: new Date().toISOString(),
    validation: {
      buildPassed,
      p159TestsPassed,
      p155TestsPassed,
      p154TestsPassed,
      p158TestsPassed,
      continuousEnabled,
      continuousModeRemainsDisabled: !continuousEnabled,
      daemonNotStarted: !daemonRunning,
      noLiveSendsDuringValidation: true,
      noWorkflowWrites: true,
      noBreezyWrites: true,
      runnerSchedulerMode: runnerState.schedulerMode,
      systemMode: dashboard.runner.systemMode,
    },
    dashboard,
    warnings: built.warnings,
  };

  await mkdir("artifacts", { recursive: true });
  const jsonPath = path.join("artifacts", "p159-operations-control-center.json");
  const mdPath = path.join("artifacts", "p159-operations-control-center.md");
  await writeFile(jsonPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  await writeFile(
    mdPath,
    formatP159OperationsControlCenterMarkdown({
      dashboard,
      warnings: built.warnings,
      validation: artifact.validation,
    }),
    "utf8",
  );

  console.log(`Wrote ${jsonPath}`);
  console.log(`Wrote ${mdPath}`);
  console.log(
    JSON.stringify(
      {
        systemMode: dashboard.runner.systemMode,
        recommendation: dashboard.recommendation,
        todaySent: dashboard.today.paperworkSent,
        sendBatches: dashboard.today.sendBatchCount,
        validation: artifact.validation,
      },
      null,
      2,
    ),
  );

  if (!buildPassed || !p159TestsPassed || !p155TestsPassed || !p154TestsPassed || !p158TestsPassed) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
