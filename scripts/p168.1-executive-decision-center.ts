/**
 * P168.1 — Executive Decision Center validation (read-only).
 */
import { readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";
import { getDropboxSignApiMetricsSnapshot } from "../src/lib/dropbox-sign-api/metrics.ts";
import { isP154ContinuousEnabled } from "../src/lib/p154-continuous-autonomous-recruiting-runner/runner-config.ts";
import { loadP1547RunnerState } from "../src/lib/p154-continuous-autonomous-recruiting-runner/runner-store.ts";
import { buildP1681ExecutiveDecisionCenterView } from "../src/lib/p168.1-executive-decision-center/build-decision-center-view.ts";
import { formatP1681Markdown } from "../src/lib/p168.1-executive-decision-center/format-p168.1-markdown.ts";
import { P168_1_SOURCE_PHASE } from "../src/lib/p168.1-executive-decision-center/types.ts";
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

  const view = await buildP1681ExecutiveDecisionCenterView();
  const pathCheck = assertP168UsesExistingProductionPath();

  const runnerAfter = await loadP1547RunnerState();
  const continuousAfter = isP154ContinuousEnabled();
  const dropboxAfter = getDropboxSignApiMetricsSnapshot().totalRequests;

  const validActions = ["WAIT", "RUN_NEXT_BATCH", "HOLD_INVESTIGATION", "NO_ACTION_REQUIRED"];

  const checks = {
    decisionScoreInRange:
      view.systemStatus.decisionScore >= 0 && view.systemStatus.decisionScore <= 100,
    decisionGradePresent: Boolean(view.systemStatus.decisionGrade),
    recommendationValid: validActions.includes(view.recommendation.action),
    singleRecommendation: Boolean(view.recommendation.id && view.recommendation.title),
    gateChecklistRendered: view.blocking.checklist.length >= 10,
    approveDisabledReasonWhenBlocked:
      view.recommendation.action !== "RUN_NEXT_BATCH"
        ? view.blocking.approveDisabledReason != null
        : true,
    historyArray: Array.isArray(view.history),
    usesP159LiveCyclePath: pathCheck.usesP159LiveCycle,
    noNewSendImplementation: pathCheck.noNewSendImplementation,
    manualApprovalRequired: view.safety.manualApprovalRequired === true,
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
  const jsonPath = path.join(artifactDir, "p168.1-executive-decision-center.json");
  const mdPath = path.join(artifactDir, "p168.1-executive-decision-center.md");

  const payload = {
    generatedAt: new Date().toISOString(),
    sourcePhase: P168_1_SOURCE_PHASE,
    passed,
    checks,
    view,
  };

  writeFileSync(jsonPath, JSON.stringify(payload, null, 2));
  writeFileSync(
    mdPath,
    [
      formatP1681Markdown(view),
      "",
      "## Validation",
      "",
      `**Passed:** ${passed ? "YES" : "NO"}`,
      "",
      ...Object.entries(checks).map(([k, v]) => `- ${k}: ${v ? "PASS" : "FAIL"}`),
      "",
      "### Safety",
      "- Read-only validation — no live batch executed",
      "- Presentation layer only — aggregates P159/P167/P168",
      "- Approve still routes through P159 executeP159OperationsControl",
    ].join("\n"),
  );

  console.log(
    JSON.stringify(
      {
        passed,
        jsonPath,
        mdPath,
        decisionScore: view.systemStatus.decisionScore,
        decisionGrade: view.systemStatus.decisionGrade,
        recommendation: view.recommendation.action,
        approveDisabledReason: view.blocking.approveDisabledReason,
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
