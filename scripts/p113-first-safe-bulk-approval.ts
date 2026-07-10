/**
 * P113 — Apply First Safe Bulk Approval Locally
 * Usage: npx tsx scripts/p113-first-safe-bulk-approval.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { applyFirstSafeBulkApproval } from "@/lib/p113-first-safe-bulk-approval";

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

  const report = await applyFirstSafeBulkApproval();

  const artifactDir = path.join(process.cwd(), "artifacts");
  await mkdir(artifactDir, { recursive: true });
  const artifactPath = path.join(artifactDir, "p113-first-safe-bulk-approval.json");
  await writeFile(artifactPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        artifactPath,
        goNoGo: report.goNoGo,
        goNoGoReason: report.goNoGoReason,
        summary: report.summary,
        approvedGroup: report.approvedGroup,
        approvedCandidates: report.approvedCandidates,
        integrationAfterApproval: report.integrationAfterApproval,
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
