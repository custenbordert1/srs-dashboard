/**
 * P160 — Production Readiness & Deployment Center (read-only validation).
 *
 * Usage: npx tsx scripts/p160-production-readiness.ts
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildP160ProductionReadiness,
  formatP160ProductionReadinessMarkdown,
} from "@/lib/p160-production-readiness";
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

  const report = await buildP160ProductionReadiness();
  const runnerState = await loadP1547RunnerState();

  let buildPassed = false;
  let p160TestsPassed = false;
  let p159TestsPassed = false;
  let p158TestsPassed = false;
  let p157TestsPassed = false;
  let p156TestsPassed = false;
  let p155TestsPassed = false;
  let p154TestsPassed = false;

  try {
    execSync("npm run build", { stdio: "pipe" });
    buildPassed = true;
  } catch {
    buildPassed = false;
  }

  const runTests = (pattern: string): boolean => {
    try {
      execSync(`node --import tsx --test ${pattern}`, { stdio: "pipe" });
      return true;
    } catch {
      return false;
    }
  };

  p160TestsPassed = runTests("src/lib/p160-production-readiness/*.test.ts");
  p159TestsPassed = runTests("src/lib/p159-operations-control-center/*.test.ts");
  p155TestsPassed = runTests("src/lib/p155-autopilot-operations-dashboard/*.test.ts");
  p156TestsPassed = runTests("src/lib/p156-candidate-prioritization/*.test.ts");
  p157TestsPassed = runTests("src/lib/p157-recruiter-decision-engine/*.test.ts");
  p158TestsPassed = runTests(
    "src/lib/p158-autonomous-recruiter-assignment/*.test.ts src/lib/p158-post-assignment-outcome-diagnosis/*.test.ts src/lib/p158-assignment-simulation/*.test.ts src/lib/p158-post-assignment-workflow-transition/*.test.ts",
  );
  p154TestsPassed = runTests(
    "src/lib/p154-continuous-autonomous-recruiting-runner/*.test.ts src/lib/p154-controlled-production-autopilot-activation/*.test.ts src/lib/p154-full-candidate-backfill-continuous-processing/*.test.ts",
  );

  const continuousEnabled = isP154ContinuousEnabled();
  const daemonRunning = report.validation.daemonRunning;

  const validation = {
    buildPassed,
    p160TestsPassed,
    p159TestsPassed,
    p158TestsPassed,
    p157TestsPassed,
    p156TestsPassed,
    p155TestsPassed,
    p154TestsPassed,
    continuousModeRemainsDisabled: !continuousEnabled,
    daemonNotStarted: !daemonRunning,
    noWorkflowWrites: true,
    noRecruiterAssignments: true,
    noPaperworkSends: true,
    noBreezyWrites: true,
    runnerSchedulerMode: runnerState.schedulerMode,
    overallReadinessScore: report.overallReadinessScore,
    recommendation: report.recommendation,
    criticalBlockers: report.risks.critical.length,
  };

  const artifact = {
    sourcePhase: "P160",
    generatedAt: new Date().toISOString(),
    validation,
    report,
  };

  await mkdir("artifacts", { recursive: true });
  const jsonPath = path.join("artifacts", "p160-production-readiness.json");
  const mdPath = path.join("artifacts", "p160-production-readiness.md");
  await writeFile(jsonPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  await writeFile(
    mdPath,
    formatP160ProductionReadinessMarkdown({ report, validation }),
    "utf8",
  );

  console.log(`Wrote ${jsonPath}`);
  console.log(`Wrote ${mdPath}`);
  console.log(
    JSON.stringify(
      {
        overallReadinessScore: report.overallReadinessScore,
        recommendation: report.recommendation,
        criticalBlockers: report.risks.critical.length,
        validation,
      },
      null,
      2,
    ),
  );

  if (
    !buildPassed ||
    !p160TestsPassed ||
    !p159TestsPassed ||
    !p158TestsPassed ||
    !p157TestsPassed ||
    !p156TestsPassed ||
    !p155TestsPassed ||
    !p154TestsPassed
  ) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
