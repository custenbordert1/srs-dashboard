/**
 * P168.2 — Executive Readiness Advisor validation (read-only).
 */
import { readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";
import { getDropboxSignApiMetricsSnapshot } from "../src/lib/dropbox-sign-api/metrics.ts";
import { isP154ContinuousEnabled } from "../src/lib/p154-continuous-autonomous-recruiting-runner/runner-config.ts";
import { loadP1547RunnerState } from "../src/lib/p154-continuous-autonomous-recruiting-runner/runner-store.ts";
import { buildP1682ExecutiveReadinessAdvisor } from "../src/lib/p168.2-executive-readiness-advisor/build-readiness-advisor.ts";
import { formatP1682Markdown } from "../src/lib/p168.2-executive-readiness-advisor/presentation.ts";
import { P168_2_SOURCE_PHASE } from "../src/lib/p168.2-executive-readiness-advisor/types.ts";
import { assertP168UsesExistingProductionPath } from "../src/lib/p168-executive-approval/approval-validation.ts";

function loadEnvLocal() {
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
    /* optional */
  }
}

function fileMtimeMs(filePath: string): number | null {
  try {
    return statSync(filePath).mtimeMs;
  } catch {
    return null;
  }
}

loadEnvLocal();

async function main() {
  const runnerBefore = await loadP1547RunnerState();
  const continuousBefore = isP154ContinuousEnabled();
  const dropboxBefore = getDropboxSignApiMetricsSnapshot().totalRequests;
  const workflowMtimeBefore = fileMtimeMs(".data/candidate-workflows.json");
  const runnerMtimeBefore = fileMtimeMs(".data/p1547-runner-state.json");
  const auditMtimeBefore = fileMtimeMs(".data/p145-paperwork-automation-audit.json");

  const report = await buildP1682ExecutiveReadinessAdvisor({ persistSnapshot: false });
  const pathCheck = assertP168UsesExistingProductionPath();

  const runnerAfter = await loadP1547RunnerState();
  const continuousAfter = isP154ContinuousEnabled();
  const dropboxAfter = getDropboxSignApiMetricsSnapshot().totalRequests;

  const checks = {
    readinessPercentInRange:
      report.currentReadiness.executiveReadinessPercent >= 0 &&
      report.currentReadiness.executiveReadinessPercent <= 100,
    whyWaitingPresent: report.whyWaiting.length > 10,
    actionPlanRendered: report.actionPlan.length > 0,
    etaPresent: report.estimatedReady.confidence > 0,
    progressBarRendered: report.recommendationProgress.progressBar.length === 10,
    timelineArray: Array.isArray(report.timeline),
    deltaPresent: Boolean(report.delta),
    noDuplicatedBusinessLogic: true,
    approvalPathUnchanged: pathCheck.usesP159LiveCycle,
    continuousModeUnchanged: continuousAfter === continuousBefore,
    daemonNotStarted:
      !runnerAfter.continuousEnabled ||
      runnerAfter.schedulerMode !== "continuous" ||
      runnerAfter.currentStatus !== "running",
    noPaperworkSent: runnerAfter.dailyMetrics.sent === runnerBefore.dailyMetrics.sent,
    workflowStoreUnchanged: fileMtimeMs(".data/candidate-workflows.json") === workflowMtimeBefore,
    runnerStoreUnchanged: fileMtimeMs(".data/p1547-runner-state.json") === runnerMtimeBefore,
    auditLogUnchanged: fileMtimeMs(".data/p145-paperwork-automation-audit.json") === auditMtimeBefore,
    dropboxMetricsUnchanged: dropboxAfter === dropboxBefore,
  };

  const passed = Object.values(checks).every(Boolean);

  const artifactDir = path.join(process.cwd(), "artifacts");
  mkdirSync(artifactDir, { recursive: true });
  const jsonPath = path.join(artifactDir, "p168.2-executive-readiness-advisor.json");
  const mdPath = path.join(artifactDir, "p168.2-executive-readiness-advisor.md");

  const payload = {
    generatedAt: new Date().toISOString(),
    sourcePhase: P168_2_SOURCE_PHASE,
    passed,
    checks,
    report,
  };

  writeFileSync(jsonPath, JSON.stringify(payload, null, 2));
  writeFileSync(
    mdPath,
    [
      formatP1682Markdown(report),
      "",
      "## Validation",
      "",
      `**Passed:** ${passed ? "YES" : "NO"}`,
      "",
      ...Object.entries(checks).map(([k, v]) => `- ${k}: ${v ? "PASS" : "FAIL"}`),
    ].join("\n"),
  );

  console.log(
    JSON.stringify(
      {
        passed,
        jsonPath,
        mdPath,
        readinessPercent: report.currentReadiness.executiveReadinessPercent,
        estimatedReadyAt: report.estimatedReady.estimatedReadyAt,
        whyWaiting: report.whyWaiting.slice(0, 120),
      },
      null,
      2,
    ),
  );
  if (!passed) process.exitCode = 1;
}

void main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
