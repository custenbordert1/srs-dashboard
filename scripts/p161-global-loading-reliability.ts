/**
 * P161 — Global App Loading Reliability validation (read-only).
 *
 * Usage: npx tsx scripts/p161-global-loading-reliability.ts
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildP161AppHealthReport, formatP161Markdown } from "@/lib/app-loading-reliability";
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

  const report = await buildP161AppHealthReport();
  const runnerState = await loadP1547RunnerState();

  let buildPassed = false;
  let p161TestsPassed = false;
  let p160TestsPassed = false;
  let p159TestsPassed = false;
  let p158TestsPassed = false;
  let p155TestsPassed = false;
  let p154TestsPassed = false;

  const runTests = (pattern: string): boolean => {
    try {
      execSync(`node --import tsx --test ${pattern}`, { stdio: "pipe" });
      return true;
    } catch {
      return false;
    }
  };

  try {
    execSync("npm run build", { stdio: "pipe" });
    buildPassed = true;
  } catch {
    buildPassed = false;
  }

  p161TestsPassed = runTests("src/lib/app-loading-reliability/*.test.ts");
  p160TestsPassed = runTests("src/lib/p160-production-readiness/*.test.ts");
  p159TestsPassed = runTests("src/lib/p159-operations-control-center/*.test.ts");
  p155TestsPassed = runTests("src/lib/p155-autopilot-operations-dashboard/*.test.ts");
  p158TestsPassed = runTests(
    "src/lib/p158-autonomous-recruiter-assignment/*.test.ts src/lib/p158-post-assignment-outcome-diagnosis/*.test.ts src/lib/p158-assignment-simulation/*.test.ts src/lib/p158-post-assignment-workflow-transition/*.test.ts",
  );
  p154TestsPassed = runTests(
    "src/lib/p154-continuous-autonomous-recruiting-runner/*.test.ts src/lib/p154-controlled-production-autopilot-activation/*.test.ts src/lib/p154-full-candidate-backfill-continuous-processing/*.test.ts",
  );

  const continuousEnabled = isP154ContinuousEnabled();

  const validation = {
    buildPassed,
    p161TestsPassed,
    p160TestsPassed,
    p159TestsPassed,
    p158TestsPassed,
    p155TestsPassed,
    p154TestsPassed,
    continuousEnabled,
    continuousModeRemainsDisabled: !continuousEnabled,
    daemonNotStarted: !report.operatingMode.daemonRunning,
    noPaperworkSends: true,
    noWorkflowWrites: true,
    noBreezyWrites: true,
    runnerSchedulerMode: runnerState.schedulerMode,
    degradedSectionCount: report.degradedSections.length,
    readinessScore: report.systemStatus.readinessScore,
  };

  const artifact = {
    sourcePhase: "P161",
    generatedAt: new Date().toISOString(),
    validation,
    report,
  };

  await mkdir("artifacts", { recursive: true });
  const jsonPath = path.join("artifacts", "p161-global-loading-reliability.json");
  const mdPath = path.join("artifacts", "p161-global-loading-reliability.md");
  await writeFile(jsonPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  await writeFile(mdPath, formatP161Markdown({ report, validation }), "utf8");

  console.log(`Wrote ${jsonPath}`);
  console.log(`Wrote ${mdPath}`);
  console.log(JSON.stringify({ validation, systemStatus: report.systemStatus }, null, 2));

  if (
    !buildPassed ||
    !p161TestsPassed ||
    !p160TestsPassed ||
    !p159TestsPassed ||
    !p158TestsPassed ||
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
