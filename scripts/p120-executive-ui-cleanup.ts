/**
 * P120 — Executive UI Cleanup & Action Summary
 * Usage: npx tsx scripts/p120-executive-ui-cleanup.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildExecutiveUiCleanupReport } from "@/lib/p120-executive-ui-cleanup";

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

  const report = await buildExecutiveUiCleanupReport();
  const artifactDir = path.join(process.cwd(), "artifacts");
  await mkdir(artifactDir, { recursive: true });
  const artifactPath = path.join(artifactDir, "p120-executive-ui-cleanup-action-summary.json");
  await writeFile(artifactPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        artifactPath,
        summary: report.summary,
        duplicatePanelsRemoved: report.duplicatePanelsRemoved,
        sectionsCollapsed: report.sectionsCollapsed,
        summaryMetrics: report.summaryMetrics,
        top5Actions: report.top5Actions.map((action) => ({
          title: action.title,
          priority: action.priority,
          expectedUnlockCount: action.expectedUnlockCount,
          businessImpact: action.businessImpact,
          recommendedOwner: action.recommendedOwner,
          safetyStatus: action.safetyStatus,
        })),
        safetyConfirmation: report.safetyConfirmation,
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
