/**
 * P151.2 — Autonomous Recruiter Assignment
 *
 * Usage:
 *   npx tsx scripts/p151.2-autonomous-recruiter-assignment.ts
 *   npx tsx scripts/p151.2-autonomous-recruiter-assignment.ts --live
 */
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  assignRecruiters,
  formatP1512AutonomousRecruiterAssignmentMarkdown,
} from "@/lib/p151-autonomous-recruiter-assignment";
import { isP151AutonomousAdvancementEnabled } from "@/lib/p151-autonomous-candidate-advancement";

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
  userId: "p151.2-recruiter-assignment",
  email: "p151.2@local",
  name: "P151.2 Recruiter Assignment",
  role: "executive" as const,
  territoryStates: [],
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
};

async function main() {
  loadEnvLocal();
  const liveFlag = process.argv.includes("--live");
  if (liveFlag && !isP151AutonomousAdvancementEnabled()) {
    console.error("[P151.2] --live requires P151_AUTONOMOUS_ADVANCEMENT_ENABLED=true");
    process.exit(1);
  }

  console.error(`[P151.2] Running ${liveFlag ? "live" : "dry-run"} recruiter assignment…`);
  const report = await assignRecruiters({ session, dryRun: !liveFlag });

  const jsonPath = path.join(process.cwd(), "artifacts", "p151.2-autonomous-recruiter-assignment.json");
  const mdPath = path.join(process.cwd(), "artifacts", "p151.2-autonomous-recruiter-assignment.md");
  await mkdir(path.dirname(jsonPath), { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(mdPath, formatP1512AutonomousRecruiterAssignmentMarkdown(report), "utf8");

  console.log(
    JSON.stringify(
      {
        ok: report.assignmentsFailed === 0 && !report.stoppedOnError,
        jsonPath,
        mdPath,
        dryRun: report.dryRun,
        candidatesEvaluated: report.candidatesEvaluated,
        recommendationCounts: report.recommendationCounts,
        assignmentsCompleted: report.assignmentsCompleted,
        assignmentsSkipped: report.assignmentsSkipped,
        candidatesRemaining: report.candidatesRemaining,
        averageRecruiterWorkload: report.averageRecruiterWorkload,
        topBlockers: report.topBlockerReasons.slice(0, 5),
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
