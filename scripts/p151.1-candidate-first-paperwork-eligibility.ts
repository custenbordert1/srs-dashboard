/**
 * P151.1 — Candidate-First Paperwork Eligibility
 *
 * Usage:
 *   npx tsx scripts/p151.1-candidate-first-paperwork-eligibility.ts
 *   npx tsx scripts/p151.1-candidate-first-paperwork-eligibility.ts --live
 */
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildCandidateFirstPaperworkReport,
  formatCandidateFirstPaperworkMarkdown,
  isP151CandidateFirstPaperworkEnabled,
} from "@/lib/candidate-first-paperwork-eligibility";

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
  userId: "p151.1-candidate-first",
  email: "p151.1@local",
  name: "P151.1 Candidate First",
  role: "executive" as const,
  territoryStates: [],
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
};

async function main() {
  loadEnvLocal();
  const liveFlag = process.argv.includes("--live");
  if (liveFlag && !isP151CandidateFirstPaperworkEnabled()) {
    console.error("[P151.1] --live requires P151_CANDIDATE_FIRST_PAPERWORK_ENABLED=true");
    process.exit(1);
  }

  console.error(`[P151.1] Running ${liveFlag ? "live" : "dry-run"} candidate-first analysis…`);
  const report = await buildCandidateFirstPaperworkReport({ session, dryRun: !liveFlag });

  const jsonPath = path.join(process.cwd(), "artifacts", "p151.1-candidate-first-paperwork-eligibility.json");
  const mdPath = path.join(process.cwd(), "artifacts", "p151.1-candidate-first-paperwork-eligibility.md");
  await mkdir(path.dirname(jsonPath), { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(mdPath, formatCandidateFirstPaperworkMarkdown(report), "utf8");

  console.log(
    JSON.stringify(
      {
        ok: report.failedCount === 0,
        jsonPath,
        mdPath,
        dryRun: report.dryRun,
        candidatesEvaluated: report.candidatesEvaluated,
        categoryCounts: report.categoryCounts,
        actionCounts: report.actionCounts,
        sent: report.sentCount,
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
