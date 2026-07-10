/**
 * P171 — Autonomous Candidate Lifecycle Manager validation (read-only by default).
 * Usage: npx tsx scripts/p171-autonomous-candidate-lifecycle-manager.ts
 */
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getDropboxSignApiMetricsSnapshot } from "../src/lib/dropbox-sign-api/metrics.ts";
import { isP154ContinuousEnabled } from "../src/lib/p154-continuous-autonomous-recruiting-runner/runner-config.ts";
import { loadP1547RunnerState } from "../src/lib/p154-continuous-autonomous-recruiting-runner/runner-store.ts";
import {
  buildP171ExceptionQueue,
  buildP171LifecycleConsole,
  formatP171Markdown,
  isP171LifecycleEnabled,
  validateP171ReadOnly,
} from "../src/lib/p171-autonomous-candidate-lifecycle-manager/index.ts";
import { assertP171UsesExistingProductionPath } from "../src/lib/p171-autonomous-candidate-lifecycle-manager/lifecycle-validation.ts";
import { P171_SOURCE_PHASE } from "../src/lib/p171-autonomous-candidate-lifecycle-manager/types.ts";

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
  const lifecycleMtimeBefore = fileMtimeMs(".data/p171-lifecycle-manager-state.json");
  const lifecycleEnabled = isP171LifecycleEnabled();

  const [lifecycleConsole, exceptions] = await Promise.all([
    buildP171LifecycleConsole(),
    buildP171ExceptionQueue(),
  ]);

  const pathCheck = assertP171UsesExistingProductionPath();
  const validation = await validateP171ReadOnly({
    lifecycleEnabled,
    before: {
      continuousMode: continuousBefore,
      runnerStatus: runnerBefore.currentStatus,
      schedulerMode: runnerBefore.schedulerMode,
      dailySent: runnerBefore.dailyMetrics.sent,
      dropboxTotal: dropboxBefore,
      workflowMtime: workflowMtimeBefore,
      runnerMtime: runnerMtimeBefore,
      auditMtime: auditMtimeBefore,
      lifecycleMtime: lifecycleMtimeBefore,
    },
  });

  const runnerAfter = await loadP1547RunnerState();
  const continuousAfter = isP154ContinuousEnabled();

  const artifact = {
    sourcePhase: P171_SOURCE_PHASE,
    generatedAt: new Date().toISOString(),
    lifecycleEnabled,
    console: lifecycleConsole,
    exceptions: {
      total: exceptions.totalExceptions,
      byCategory: exceptions.byCategory,
    },
    pathCheck,
    validation,
    safety: {
      continuousModeBefore: continuousBefore,
      continuousModeAfter: continuousAfter,
      daemonNotStarted:
        !runnerAfter.continuousEnabled ||
        runnerAfter.schedulerMode !== "continuous" ||
        runnerAfter.currentStatus !== "running",
    },
    checks: {
      consoleRendered: lifecycleConsole.sourcePhase === P171_SOURCE_PHASE,
      statusPresent: ["running", "idle", "paused"].includes(lifecycleConsole.status),
      healthScoreInRange:
        lifecycleConsole.health.score >= 0 && lifecycleConsole.health.score <= 100,
      exceptionQueueReadable: Array.isArray(exceptions.exceptions),
      usesP159Path: pathCheck.usesP159LiveCycle,
      usesP157Evaluation: pathCheck.usesP157Evaluation,
      usesP146Reminders: pathCheck.usesP146Reminders,
      usesP107Monitor: pathCheck.usesP107SignatureMonitor,
      noDuplicateSendLogic: pathCheck.noDuplicateSendLogic,
      noDuplicateReminderLogic: pathCheck.noDuplicateReminderLogic,
      notAutoEnabled: !lifecycleEnabled || lifecycleConsole.config.enabled,
      validationPassed: validation.passed,
    },
  };

  const allPassed = Object.values(artifact.checks).every(Boolean);

  mkdirSync(path.join(process.cwd(), "artifacts"), { recursive: true });
  const jsonPath = path.join(process.cwd(), "artifacts", "p171-autonomous-candidate-lifecycle-manager.json");
  const mdPath = path.join(process.cwd(), "artifacts", "p171-autonomous-candidate-lifecycle-manager.md");
  writeFileSync(jsonPath, `${JSON.stringify(artifact, null, 2)}\n`);
  writeFileSync(
    mdPath,
    `${formatP171Markdown(lifecycleConsole)}\n\n## Validation\n\n\`\`\`json\n${JSON.stringify(artifact.checks, null, 2)}\n\`\`\`\n`,
  );

  console.log(`P171 validation ${allPassed ? "PASSED" : "FAILED"}`);
  console.log(`Lifecycle enabled: ${lifecycleEnabled}`);
  console.log(`Status: ${lifecycleConsole.statusLabel}`);
  console.log(`Health: ${lifecycleConsole.health.label} (${lifecycleConsole.health.score})`);
  console.log(`Exceptions: ${exceptions.totalExceptions}`);
  console.log(`Automation rate: ${lifecycleConsole.metrics.automationSuccessRate}%`);
  console.log(`Artifacts: ${jsonPath}`);

  if (!allPassed) process.exitCode = 1;
}

void main();
