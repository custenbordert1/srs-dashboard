/**
 * P151 — Autonomous Candidate Advancement
 *
 * Usage:
 *   npx tsx scripts/p151-autonomous-candidate-advancement.ts
 *   npx tsx scripts/p151-autonomous-candidate-advancement.ts --live
 */
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  advanceCandidatePipeline,
  formatP151AutonomousCandidateAdvancementMarkdown,
  isP151AutonomousAdvancementEnabled,
} from "@/lib/p151-autonomous-candidate-advancement";

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
  userId: "p151-autonomous-advancement",
  email: "p151@local",
  name: "P151 Autonomous Advancement",
  role: "executive" as const,
  territoryStates: [],
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
};

async function main() {
  loadEnvLocal();

  const liveFlag = process.argv.includes("--live");
  if (liveFlag && !isP151AutonomousAdvancementEnabled()) {
    console.error("[P151] --live requires P151_AUTONOMOUS_ADVANCEMENT_ENABLED=true");
    process.exit(1);
  }

  console.error(`[P151] Running ${liveFlag ? "live" : "dry-run"} pipeline analysis…`);
  const report = await advanceCandidatePipeline({ session, dryRun: !liveFlag });

  const jsonPath = path.join(process.cwd(), "artifacts", "p151-autonomous-candidate-advancement.json");
  const mdPath = path.join(process.cwd(), "artifacts", "p151-autonomous-candidate-advancement.md");
  await mkdir(path.dirname(jsonPath), { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(mdPath, formatP151AutonomousCandidateAdvancementMarkdown(report), "utf8");

  console.log(
    JSON.stringify(
      {
        ok: report.failures === 0 && !report.stoppedOnError,
        jsonPath,
        mdPath,
        dryRun: report.dryRun,
        candidatesEvaluated: report.candidatesEvaluated,
        eligibleForAssignment: report.candidatesEligibleForAssignment,
        eligibleForAdvancement: report.candidatesEligibleForAdvancement,
        recruitersAssigned: report.recruitersAssigned,
        candidatesAdvanced: report.candidatesAdvanced,
        blocked: report.candidatesBlocked,
        topBlockers: report.topBlockerCounts.slice(0, 5),
        readinessScore: report.readinessScore,
        executionTimeMs: report.executionTimeMs,
        safetyFlags: report.safetyFlags,
        rollbackRecommendation: report.rollbackRecommendation,
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
