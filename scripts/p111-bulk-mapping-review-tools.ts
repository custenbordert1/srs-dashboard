/**
 * P111 — Bulk Mapping Review Tools (dryRun only)
 * Usage: npx tsx scripts/p111-bulk-mapping-review-tools.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildBulkMappingReviewToolsReport } from "@/lib/p111-bulk-mapping-review";

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

  const report = await buildBulkMappingReviewToolsReport();

  const artifactDir = path.join(process.cwd(), "artifacts");
  await mkdir(artifactDir, { recursive: true });
  const artifactPath = path.join(artifactDir, "p111-bulk-mapping-review-tools.json");
  await writeFile(artifactPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        artifactPath,
        summary: report.summary,
        metrics: report.metrics,
        topRecommendedBulkApprovals: report.topRecommendedBulkApprovals.slice(0, 3).map((g) => ({
          groupId: g.groupId,
          closedTitle: g.closedPositionTitle,
          recommended: g.recommendedPositionTitle,
          count: g.candidateCount,
          avgConfidence: g.averageConfidence,
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
