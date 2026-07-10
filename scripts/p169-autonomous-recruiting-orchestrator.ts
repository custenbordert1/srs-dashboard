/**
 * P169 — Autonomous Recruiting Orchestrator validation (read-only by default).
 * Usage: npx tsx scripts/p169-autonomous-recruiting-orchestrator.ts
 */
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getDropboxSignApiMetricsSnapshot } from "../src/lib/dropbox-sign-api/metrics.ts";
import { isP154ContinuousEnabled } from "../src/lib/p154-continuous-autonomous-recruiting-runner/runner-config.ts";
import { loadP1547RunnerState } from "../src/lib/p154-continuous-autonomous-recruiting-runner/runner-store.ts";
import {
  buildP169ExceptionQueue,
  buildP169OperationsConsole,
  formatP169Markdown,
  isP169OrchestratorEnabled,
  validateP169ReadOnly,
} from "../src/lib/p169-autonomous-recruiting-orchestrator/index.ts";
import { assertP169UsesExistingProductionPath } from "../src/lib/p169-autonomous-recruiting-orchestrator/orchestrator-validation.ts";
import { P169_SOURCE_PHASE } from "../src/lib/p169-autonomous-recruiting-orchestrator/types.ts";

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
  const orchestratorEnabled = isP169OrchestratorEnabled();

  const [opsConsole, exceptions] = await Promise.all([
    buildP169OperationsConsole(),
    buildP169ExceptionQueue(),
  ]);
  const pathCheck = assertP169UsesExistingProductionPath();
  const validation = await validateP169ReadOnly({
    orchestratorEnabled,
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

  const runnerAfter = await loadP1547RunnerState();
  const continuousAfter = isP154ContinuousEnabled();

  const artifact = {
    sourcePhase: P169_SOURCE_PHASE,
    generatedAt: new Date().toISOString(),
    orchestratorEnabled,
    console: opsConsole,
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
      consoleRendered: opsConsole.sourcePhase === P169_SOURCE_PHASE,
      statusPresent: ["running", "idle", "paused"].includes(opsConsole.status),
      healthScoreInRange: opsConsole.health.score >= 0 && opsConsole.health.score <= 100,
      exceptionQueueReadable: Array.isArray(exceptions.exceptions),
      usesP159Path: pathCheck.usesP159LiveCycle,
      noNewSendLogic: pathCheck.noNewSendImplementation,
      notAutoEnabled: !orchestratorEnabled || opsConsole.config.enabled,
      validationPassed: validation.passed,
    },
  };

  const allPassed = Object.values(artifact.checks).every(Boolean);

  mkdirSync(path.join(process.cwd(), "artifacts"), { recursive: true });
  const jsonPath = path.join(process.cwd(), "artifacts", "p169-autonomous-recruiting-orchestrator.json");
  const mdPath = path.join(process.cwd(), "artifacts", "p169-autonomous-recruiting-orchestrator.md");
  writeFileSync(jsonPath, `${JSON.stringify(artifact, null, 2)}\n`);
  writeFileSync(mdPath, `${formatP169Markdown(opsConsole)}\n\n## Validation\n\n\`\`\`json\n${JSON.stringify(artifact.checks, null, 2)}\n\`\`\`\n`);

  console.log(`P169 validation ${allPassed ? "PASSED" : "FAILED"}`);
  console.log(`Orchestrator enabled: ${orchestratorEnabled}`);
  console.log(`Status: ${opsConsole.statusLabel}`);
  console.log(`Health: ${opsConsole.health.label} (${opsConsole.health.score})`);
  console.log(`Exceptions: ${exceptions.totalExceptions}`);
  console.log(`Artifacts: ${jsonPath}`);

  if (!allPassed) process.exitCode = 1;
}

void main();
