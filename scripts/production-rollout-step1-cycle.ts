/**
 * Production Rollout Step 1 — orchestrator cycle runner
 * Orchestrator enabled; P146/P147 sends remain disabled.
 *
 * Usage:
 *   npx tsx scripts/production-rollout-step1-cycle.ts
 *   npx tsx scripts/production-rollout-step1-cycle.ts --scheduled
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  getOrchestratorIntervalMinutes,
  isAutonomousRecruitingEnabled,
} from "@/lib/p148-autonomous-recruiting-orchestrator/orchestrator-store";
import { runAutonomousRecruitingCycle } from "@/lib/recruiting/autonomous-recruiting-orchestrator";
import { isP146AutoSendEnabled } from "@/lib/recruiting/paperwork-execution-engine";
import { isP147InitialPaperworkAutoSendEnabled } from "@/lib/recruiting/initial-paperwork-execution-engine";

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

const session = {
  userId: "rollout-step1",
  email: "rollout@local",
  name: "Rollout Step 1",
  role: "executive" as const,
  territoryStates: [],
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
};

async function runOnce(): Promise<void> {
  if (!isAutonomousRecruitingEnabled()) {
    console.error("[rollout-step1] AUTONOMOUS_RECRUITING_ENABLED is not true — aborting.");
    process.exit(1);
  }
  if (isP146AutoSendEnabled() || isP147InitialPaperworkAutoSendEnabled()) {
    console.error("[rollout-step1] P146/P147 auto-send must remain false for Step 1.");
    process.exit(1);
  }

  const result = await runAutonomousRecruitingCycle({ session, dryRun: false });
  console.log(
    JSON.stringify(
      {
        ok: result.success,
        runId: result.runId,
        durationMs: result.durationMs,
        phases: result.phaseTimings.length,
        candidatesEvaluated: result.candidatesEvaluated,
        blockedCandidates: result.blockedCandidates,
        remindersSent: result.remindersSent,
        initialPaperworkSent: result.initialPaperworkSent,
        paperworkSent: result.paperworkSent,
        breezyWrites: result.breezyWrites,
        warnings: result.warnings,
        failures: result.failures,
      },
      null,
      2,
    ),
  );
}

async function main() {
  loadEnvLocal();

  if (process.argv.includes("--scheduled")) {
    const intervalMs = getOrchestratorIntervalMinutes() * 60_000;
    console.error(`[rollout-step1] Scheduled — every ${intervalMs / 1000}s (sends disabled)`);
    const tick = () => runOnce().catch((error) => console.error(error instanceof Error ? error.message : error));
    await tick();
    setInterval(() => void tick(), intervalMs);
    return;
  }

  await runOnce();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
