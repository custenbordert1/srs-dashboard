/**
 * P118 — Autonomous Paperwork Operations Center
 * Usage: npx tsx scripts/p118-autonomous-paperwork-operations-center.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildAutonomousPaperworkOperationsCenterReport } from "@/lib/p118-autonomous-paperwork-operations-center";

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

  const report = await buildAutonomousPaperworkOperationsCenterReport();
  const artifactDir = path.join(process.cwd(), "artifacts");
  await mkdir(artifactDir, { recursive: true });
  const artifactPath = path.join(artifactDir, "p118-autonomous-paperwork-operations-center.json");
  await writeFile(artifactPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        artifactPath,
        goNoGo: report.goNoGo,
        summary: report.summary,
        healthSummary: report.healthSummary,
        queueDepth: report.queueDepth,
        activeAlerts: report.alerts.filter((alert) => alert.active).map((alert) => alert.type),
        recommendedActions: report.recommendedActions,
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
