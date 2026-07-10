/**
 * P119 — Autonomous Recovery & Action Queue Engine
 * Usage: npx tsx scripts/p119-autonomous-recovery.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildAutonomousRecoveryReport } from "@/lib/p119-autonomous-recovery-engine";

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
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // use process env
  }
}

async function main() {
  loadEnvLocal();

  const report = await buildAutonomousRecoveryReport();
  const artifactDir = path.join(process.cwd(), "artifacts");
  await mkdir(artifactDir, { recursive: true });
  const artifactPath = path.join(artifactDir, "p119-autonomous-recovery.json");
  await writeFile(artifactPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        artifactPath,
        goNoGo: report.goNoGo,
        summary: report.summary,
        recoveryDistribution: report.recoveryDistribution,
        topOpportunities: report.topOpportunities.slice(0, 5),
        estimatedPaperworkUnlocked: report.executiveSummary.estimatedPaperworkUnlocked,
        estimatedRecruiterHoursSaved: report.executiveSummary.estimatedRecruiterHoursSaved,
        topActionQueue: report.actionQueue.slice(0, 5).map((action) => ({
          actionType: action.actionType,
          priority: action.priority,
          expectedUnlockCount: action.expectedUnlockCount,
        })),
        impactSimulation: report.impactSimulation,
        topRecommendations: report.topRecommendations,
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
