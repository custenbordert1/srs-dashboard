/**
 * P101 — Live send operator go/no-go checklist.
 * Usage: npx tsx scripts/p101-live-send-operator-checklist.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildLiveSendOperatorChecklist } from "@/lib/live-send-operator-checklist";

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
  const report = await buildLiveSendOperatorChecklist({ mtdOnly: true });
  console.log(
    JSON.stringify(
      {
        goNoGo: report.goNoGo,
        goNoGoReason: report.goNoGoReason,
        metrics: report.metrics,
        checklist: report.checklist,
        remainingActionsBeforeExecuteOne: report.remainingActionsBeforeExecuteOne,
        recommendedFirstLiveSendApproach: report.recommendedFirstLiveSendApproach,
        artifactPaths: report.artifactPaths,
        executeOneCommand: report.executeOneCommand,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
