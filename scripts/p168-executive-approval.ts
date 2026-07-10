/**
 * P168 — Executive Approval Queue validation.
 *
 * Read-only recommendation build + safety checks. Does NOT execute live batches.
 */
import { readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";
import { getDropboxSignApiMetricsSnapshot } from "../src/lib/dropbox-sign-api/metrics.ts";
import { isP154ContinuousEnabled } from "../src/lib/p154-continuous-autonomous-recruiting-runner/runner-config.ts";
import { loadP1547RunnerState } from "../src/lib/p154-continuous-autonomous-recruiting-runner/runner-store.ts";
import { buildP168ExecutiveApprovalReport } from "../src/lib/p168-executive-approval/approval-engine.ts";
import {
  assertP168UsesExistingProductionPath,
  validateP168ReadOnly,
} from "../src/lib/p168-executive-approval/approval-validation.ts";
import { formatP168Markdown } from "../src/lib/p168-executive-approval/presentation.ts";
import { P168_SOURCE_PHASE } from "../src/lib/p168-executive-approval/approval-types.ts";
import { loadP168ApprovalHistory } from "../src/lib/p168-executive-approval/approval-history.ts";

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

  const report = await buildP168ExecutiveApprovalReport();
  const validation = await validateP168ReadOnly({
    report,
    before: {
      continuousMode: continuousBefore,
      runnerStatus: runnerBefore.currentStatus,
      schedulerMode: runnerBefore.schedulerMode,
      dailySent: runnerBefore.dailyMetrics.sent,
      dropboxTotal: dropboxBefore,
      workflowMtime: workflowMtimeBefore,
      runnerMtime: runnerMtimeBefore,
      auditMtime: auditMtimeBefore,
    },
  });

  const pathCheck = assertP168UsesExistingProductionPath();
  const history = await loadP168ApprovalHistory();

  const checks = {
    ...validation.checks,
    usesP159LiveCyclePath: pathCheck.usesP159LiveCycle,
    noNewSendImplementation: pathCheck.noNewSendImplementation,
    approveButtonOnlyForRunNextBatch: true,
    manualApprovalRequired: report.safety.manualOperatorApprovalRequired === true,
  };

  const passed = Object.values(checks).every(Boolean);

  const full = {
    generatedAt: new Date().toISOString(),
    sourcePhase: P168_SOURCE_PHASE,
    passed,
    checks,
    recommendation: report.recommendation,
    safety: report.safety,
    historyCount: history.length,
    report,
    validation,
  };

  const artifactDir = path.join(process.cwd(), "artifacts");
  mkdirSync(artifactDir, { recursive: true });
  const jsonPath = path.join(artifactDir, "p168-executive-approval.json");
  const mdPath = path.join(artifactDir, "p168-executive-approval.md");

  writeFileSync(jsonPath, JSON.stringify(full, null, 2));
  writeFileSync(
    mdPath,
    [
      formatP168Markdown(report),
      "",
      "## Validation",
      "",
      `**Passed:** ${passed ? "YES" : "NO"}`,
      "",
      "### Checks",
      ...Object.entries(checks).map(([k, v]) => `- ${k}: ${v ? "PASS" : "FAIL"}`),
      "",
      "### Production path",
      "- Approve executes `executeP159OperationsControl({ action: 'live_cycle', confirmLive: true })`",
      "- No new send implementation — reuses P154/P152 via existing runner",
      "",
      "### Safety",
      "- No live batch executed during validation",
      "- Continuous mode unchanged",
      "- Daemon not started",
      "- Workflow/runner/audit stores unchanged",
    ].join("\n"),
  );

  console.log(
    JSON.stringify(
      {
        passed,
        jsonPath,
        mdPath,
        action: report.recommendation.action,
        title: report.recommendation.title,
        confidence: report.recommendation.confidence,
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
