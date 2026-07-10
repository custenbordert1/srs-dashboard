/**
 * P167 — Intelligent Production Scheduler validation (read-only).
 *
 * Confirms the scheduler engine produces recommendations without mutating
 * production state: no sends, no Dropbox API calls, no Breezy/workflow writes.
 */
import { readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";
import { getDropboxSignApiMetricsSnapshot } from "../src/lib/dropbox-sign-api/metrics.ts";
import { isP154ContinuousEnabled } from "../src/lib/p154-continuous-autonomous-recruiting-runner/runner-config.ts";
import { loadP1547RunnerState } from "../src/lib/p154-continuous-autonomous-recruiting-runner/runner-store.ts";
import { buildP167ProductionSchedulerReport } from "../src/lib/p167-intelligent-production-scheduler/build-production-scheduler.ts";
import { formatP167Markdown } from "../src/lib/p167-intelligent-production-scheduler/format-p167-markdown.ts";
import { P167_SOURCE_PHASE } from "../src/lib/p167-intelligent-production-scheduler/types.ts";

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
  const today = new Date().toISOString().slice(0, 10);
  const runnerBefore = await loadP1547RunnerState();
  const continuousBefore = isP154ContinuousEnabled();
  const dropboxBefore = getDropboxSignApiMetricsSnapshot();
  const workflowMtimeBefore = fileMtimeMs(".data/candidate-workflows.json");
  const runnerMtimeBefore = fileMtimeMs(".data/p1547-runner-state.json");
  const auditMtimeBefore = fileMtimeMs(".data/p145-paperwork-automation-audit.json");

  const report = await buildP167ProductionSchedulerReport();

  const runnerAfter = await loadP1547RunnerState();
  const continuousAfter = isP154ContinuousEnabled();
  const dropboxAfter = getDropboxSignApiMetricsSnapshot();
  const workflowMtimeAfter = fileMtimeMs(".data/candidate-workflows.json");
  const runnerMtimeAfter = fileMtimeMs(".data/p1547-runner-state.json");
  const auditMtimeAfter = fileMtimeMs(".data/p145-paperwork-automation-audit.json");

  const todayCycles = report.timeline.filter((c) =>
    (c.completedAt ?? c.startedAt).startsWith(today),
  );

  const validRecommendations = [
    "READY_NOW",
    "WAIT_2_MINUTES",
    "WAIT_5_MINUTES",
    "WAIT_10_MINUTES",
    "WAIT_15_MINUTES",
    "NO_ELIGIBLE_CANDIDATES",
    "PAUSE_INVESTIGATION_REQUIRED",
  ];

  const checks = {
    recommendationValid: validRecommendations.includes(report.decision.recommendation),
    confidenceInRange:
      report.decision.confidence >= 0 && report.decision.confidence <= 100,
    simulationsCount: report.simulations.length === 5,
    timelineFromToday: todayCycles.length >= 1,
    noPaperworkSent: runnerAfter.dailyMetrics.sent === runnerBefore.dailyMetrics.sent,
    noNewRunnerErrors: runnerAfter.dailyMetrics.errors === runnerBefore.dailyMetrics.errors,
    continuousModeUnchanged: continuousAfter === continuousBefore,
    daemonNotStarted:
      !runnerAfter.continuousEnabled ||
      runnerAfter.schedulerMode !== "continuous" ||
      runnerAfter.currentStatus !== "running",
    dropboxMetricsUnchanged:
      dropboxAfter.totalRequests === dropboxBefore.totalRequests &&
      dropboxAfter.postRequests === dropboxBefore.postRequests &&
      dropboxAfter.getRequests === dropboxBefore.getRequests,
    workflowStoreUnchanged: workflowMtimeAfter === workflowMtimeBefore,
    runnerStoreUnchanged: runnerMtimeAfter === runnerMtimeBefore,
    auditLogUnchanged: auditMtimeAfter === auditMtimeBefore,
    readOnlySimulations: report.simulations.every((s) =>
      s.notes.some((n) => n.toLowerCase().includes("read-only")),
    ),
  };

  const passed = Object.values(checks).every(Boolean);

  const validation = {
    generatedAt: new Date().toISOString(),
    sourcePhase: P167_SOURCE_PHASE,
    passed,
    checks,
    todayProductionHistory: {
      cyclesObserved: todayCycles.length,
      totalPaperworkSent: todayCycles.reduce((s, c) => s + c.paperworkSent, 0),
      totalApiEstimate: todayCycles.reduce((s, c) => s + c.apiRequestsEstimate, 0),
      cycles: todayCycles,
    },
    before: {
      continuousMode: continuousBefore,
      runnerStatus: runnerBefore.currentStatus,
      schedulerMode: runnerBefore.schedulerMode,
      dailySent: runnerBefore.dailyMetrics.sent,
      dailyErrors: runnerBefore.dailyMetrics.errors,
    },
    after: {
      continuousMode: continuousAfter,
      runnerStatus: runnerAfter.currentStatus,
      schedulerMode: runnerAfter.schedulerMode,
      dailySent: runnerAfter.dailyMetrics.sent,
      dailyErrors: runnerAfter.dailyMetrics.errors,
    },
    decision: report.decision,
    warnings: report.warnings,
  };

  const artifactDir = path.join(process.cwd(), "artifacts");
  mkdirSync(artifactDir, { recursive: true });
  const jsonPath = path.join(artifactDir, "p167-intelligent-production-scheduler.json");
  const mdPath = path.join(artifactDir, "p167-intelligent-production-scheduler.md");

  const fullReport = { validation, report };
  writeFileSync(jsonPath, JSON.stringify(fullReport, null, 2));
  writeFileSync(
    mdPath,
    [
      formatP167Markdown(report),
      "",
      "## Validation",
      "",
      `**Passed:** ${passed ? "YES" : "NO"}`,
      "",
      "### Checks",
      ...Object.entries(checks).map(([k, v]) => `- ${k}: ${v ? "PASS" : "FAIL"}`),
      "",
      "### Today's production history",
      `- Cycles: ${todayCycles.length}`,
      `- Paperwork sent: ${validation.todayProductionHistory.totalPaperworkSent}`,
      `- API estimate: ${validation.todayProductionHistory.totalApiEstimate}`,
      "",
      "### Safety confirmation",
      "- No paperwork sent during validation",
      "- No Dropbox API metric changes",
      "- Continuous mode unchanged",
      "- Daemon not started",
      "- Workflow/runner/audit stores unchanged",
    ].join("\n"),
  );

  console.log(JSON.stringify({ passed, jsonPath, mdPath, recommendation: report.decision.recommendation }, null, 2));
  if (!passed) process.exitCode = 1;
}

void main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
