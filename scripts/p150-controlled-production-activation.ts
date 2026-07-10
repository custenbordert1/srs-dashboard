/**
 * P150 — Controlled Production Activation: Autonomous Paperwork Sending
 *
 * Usage:
 *   npx tsx scripts/p150-controlled-production-activation.ts           # classify + dry run
 *   npx tsx scripts/p150-controlled-production-activation.ts --live     # requires P150_CONTROLLED_PRODUCTION_ACTIVATION_ENABLED=true
 */
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  executeControlledProductionActivation,
  isP150ControlledProductionActivationEnabled,
  getP150MaxSendsPerCycle,
} from "@/lib/p150-controlled-production-activation";
import { formatP150ProductionActivationMarkdown } from "@/lib/p150-controlled-production-activation/format-p150-production-activation-markdown";
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
  userId: "p150-production-activation",
  email: "p150@local",
  name: "P150 Production Activation",
  role: "executive" as const,
  territoryStates: [],
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
};

async function main() {
  loadEnvLocal();

  const liveFlag = process.argv.includes("--live");
  if (liveFlag && !isP150ControlledProductionActivationEnabled()) {
    console.error(
      "[P150] --live requires P150_CONTROLLED_PRODUCTION_ACTIVATION_ENABLED=true in .env.local",
    );
    process.exit(1);
  }
  if (isP147InitialPaperworkAutoSendEnabled()) {
    console.error(
      "[P150] P147_INITIAL_PAPERWORK_AUTO_SEND_ENABLED must remain false — use P150 controlled path only.",
    );
    process.exit(1);
  }

  const dryRun = !liveFlag;
  console.error(
    `[P150] Starting ${dryRun ? "classification + dry run" : "controlled live activation"} (max sends: ${getP150MaxSendsPerCycle()})…`,
  );

  const report = await executeControlledProductionActivation({ session, dryRun });

  const jsonPath = path.join(process.cwd(), "artifacts", "p150-production-activation.json");
  const mdPath = path.join(process.cwd(), "artifacts", "p150-production-activation.md");
  await mkdir(path.dirname(jsonPath), { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(mdPath, formatP150ProductionActivationMarkdown(report), "utf8");

  console.log(
    JSON.stringify(
      {
        ok: report.failedCount === 0 && !report.stoppedOnError,
        jsonPath,
        mdPath,
        dryRun: report.dryRun,
        candidatesEvaluated: report.classification.candidatesEvaluated,
        readyToSend: report.classification.categoryCounts.READY_TO_SEND,
        sent: report.sentCount,
        skipped: report.skippedCount,
        blocked: report.blockedCount,
        failures: report.failedCount,
        duplicatesPrevented: report.duplicatesPrevented,
        cooldownBlocked: report.cooldownBlocked,
        executionTimeMs: report.executionTimeMs,
        capReached: report.capReached,
        rollbackRecommendation: report.rollbackRecommendation,
        executeBatchCalled: false,
        breezyWrites: report.breezyWrites,
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
