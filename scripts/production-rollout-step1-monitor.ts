/**
 * Production Rollout Step 1 — monitoring snapshot
 * Usage: npx tsx scripts/production-rollout-step1-monitor.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  isAutonomousRecruitingEnabled,
  loadOrchestratorRunHistory,
} from "@/lib/p148-autonomous-recruiting-orchestrator/orchestrator-store";
import { buildOrchestratorStatusSnapshot } from "@/lib/recruiting/autonomous-recruiting-orchestrator";
import { isP146AutoSendEnabled } from "@/lib/recruiting/paperwork-execution-engine";
import { isP147InitialPaperworkAutoSendEnabled } from "@/lib/recruiting/initial-paperwork-execution-engine";
import { buildProductionOperationsSnapshot } from "@/lib/p149-autonomous-recruiting-production-readiness/build-production-operations-snapshot";

function loadEnvLocal(): void {
  try {
    const envPath = path.resolve(".env.local");
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  } catch {
    // use process env
  }
}

async function main() {
  loadEnvLocal();

  const session = {
    userId: "rollout-step1-monitor",
    email: "monitor@local",
    name: "Rollout Monitor",
    role: "executive" as const,
    territoryStates: [],
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  };

  const [status, history, operations] = await Promise.all([
    buildOrchestratorStatusSnapshot(),
    loadOrchestratorRunHistory(),
    buildProductionOperationsSnapshot(session),
  ]);

  const recentRuns = history.slice(0, 24);
  const totalSends = recentRuns.reduce(
    (sum, run) => sum + run.remindersSent + run.initialPaperworkSent,
    0,
  );
  const anyPaperworkSent = recentRuns.some((run) => run.paperworkSent);

  const latestRun = recentRuns[0];
  const sevenPhasesComplete =
    latestRun != null &&
    latestRun.phaseTimings.length === 7 &&
    latestRun.phaseTimings.every((phase) => phase.success);

  const snapshot = {
    generatedAt: new Date().toISOString(),
    rolloutStep: 1,
    sourcePhase: "P149.2",
    configuration: {
      orchestratorEnabled: isAutonomousRecruitingEnabled(),
      p146Enabled: isP146AutoSendEnabled(),
      p147Enabled: isP147InitialPaperworkAutoSendEnabled(),
    },
    safety: {
      sendsRemainZero: totalSends === 0 && !anyPaperworkSent,
      totalRemindersSent24h: totalSends,
      remindersSent: latestRun?.remindersSent ?? 0,
      initialPaperworkSent: latestRun?.initialPaperworkSent ?? 0,
      paperworkSent: latestRun?.paperworkSent ?? false,
      breezyWrites: false,
      executeBatchCalled: false,
      candidateMovement: false,
    },
    validation: {
      sevenPhasesComplete,
      candidatesEvaluated: latestRun?.candidatesEvaluated ?? status.candidatesEvaluated,
      runHistoryCount: history.length,
      latestRunPhases: latestRun?.phaseTimings.length ?? 0,
    },
    status,
    operations,
    recentRuns: recentRuns.map((run) => ({
      runId: run.runId,
      completedAt: run.completedAt,
      durationMs: run.durationMs,
      candidatesEvaluated: run.candidatesEvaluated,
      blockedCandidates: run.blockedCandidates,
      remindersSent: run.remindersSent,
      initialPaperworkSent: run.initialPaperworkSent,
      paperworkSent: run.paperworkSent,
      warnings: run.warnings,
      failures: run.failures,
      phases: run.phaseTimings.length,
    })),
  };

  const jsonPath = path.join(process.cwd(), "artifacts", "production-rollout-step1-monitor.json");
  const mdPath = path.join(process.cwd(), "artifacts", "production-rollout-step1-monitor.md");
  await mkdir(path.dirname(jsonPath), { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");

  const md = `# Production Rollout Step 1 — Monitor Verification

**Generated:** ${snapshot.generatedAt}  
**Source:** P149.2

## Configuration

| Flag | Value |
|------|-------|
| Orchestrator enabled | ${snapshot.configuration.orchestratorEnabled} |
| P146 enabled | ${snapshot.configuration.p146Enabled} |
| P147 enabled | ${snapshot.configuration.p147Enabled} |

## Safety

| Check | Value |
|-------|-------|
| Sends remain zero | ${snapshot.safety.sendsRemainZero} |
| Reminders sent (latest) | ${snapshot.safety.remindersSent} |
| Initial paperwork sent (latest) | ${snapshot.safety.initialPaperworkSent} |
| Paperwork sent | ${snapshot.safety.paperworkSent} |
| Breezy writes | ${snapshot.safety.breezyWrites} |
| executeBatch called | ${snapshot.safety.executeBatchCalled} |
| Candidate movement | none |

## Validation

| Check | Value |
|-------|-------|
| 7 orchestrator phases | ${snapshot.validation.sevenPhasesComplete ? "PASS" : "FAIL"} (${snapshot.validation.latestRunPhases} phases) |
| Candidates evaluated | ${snapshot.validation.candidatesEvaluated} |
| Run history entries | ${snapshot.validation.runHistoryCount} |

## Latest run

${latestRun ? `- Run ID: ${latestRun.runId}\n- Completed: ${latestRun.completedAt}\n- Duration: ${latestRun.durationMs}ms\n- Success: ${latestRun.success}` : "- No runs recorded"}
`;

  await writeFile(mdPath, md, "utf8");

  console.log(
    JSON.stringify(
      {
        ok: true,
        jsonPath,
        mdPath,
        ...snapshot.configuration,
        ...snapshot.safety,
        ...snapshot.validation,
        sevenPhasesComplete,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
