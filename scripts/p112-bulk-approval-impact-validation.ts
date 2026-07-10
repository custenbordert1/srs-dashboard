/**
 * P112 — Bulk Approval Impact Validation
 * Usage: npx tsx scripts/p112-bulk-approval-impact-validation.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildBulkApprovalImpactValidationReport } from "@/lib/p112-bulk-approval-impact-validation";

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

  const report = await buildBulkApprovalImpactValidationReport();

  const artifactDir = path.join(process.cwd(), "artifacts");
  await mkdir(artifactDir, { recursive: true });
  const artifactPath = path.join(artifactDir, "p112-bulk-approval-impact-validation.json");
  await writeFile(artifactPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        artifactPath,
        goNoGo: report.goNoGo,
        goNoGoReason: report.goNoGoReason,
        summary: report.summary,
        metrics: report.metrics,
        recommendedFirstGroupToApprove: report.recommendedFirstGroupToApprove,
        topGroups: report.groupSimulations.slice(0, 3).map((group) => ({
          groupId: group.groupId,
          groupName: group.groupName,
          count: group.candidateCount,
          avgConfidence: group.averageConfidence,
          newlyEligible: group.newlyEligibleAfterApproval,
          safeToApprove: group.safeToApprove,
        })),
        safetyStatus: report.safetyStatus,
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
