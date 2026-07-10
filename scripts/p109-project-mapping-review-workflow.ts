/**
 * P109 — Project Mapping Review Workflow (dryRun only)
 * Usage: npx tsx scripts/p109-project-mapping-review-workflow.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildReviewWorkflowReport } from "@/lib/p109-project-mapping-review";

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

  const report = await buildReviewWorkflowReport();

  const artifactDir = path.join(process.cwd(), "artifacts");
  await mkdir(artifactDir, { recursive: true });
  const artifactPath = path.join(artifactDir, "p109-project-mapping-review-workflow.json");
  await writeFile(artifactPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        artifactPath,
        summary: report.summary,
        metrics: report.metrics,
        safetyStatus: report.safetyStatus,
        topProjectsNeedingReview: report.topProjectsNeedingReview.slice(0, 3),
        highestConfidencePending: report.highestConfidencePending.map((c) => ({
          candidateId: c.candidateId,
          name: c.candidateName,
          confidence: c.confidenceScore,
        })),
        warnings: report.warnings,
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
