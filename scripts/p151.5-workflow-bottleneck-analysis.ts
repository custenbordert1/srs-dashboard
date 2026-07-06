/**
 * P151.5 — Workflow bottleneck analysis
 *
 * Usage:
 *   npx tsx scripts/p151.5-workflow-bottleneck-analysis.ts
 *   npx tsx scripts/p151.5-workflow-bottleneck-analysis.ts --live
 */
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildBottleneckResolutionReport,
  formatBottleneckResolutionMarkdown,
} from "@/lib/p151-workflow-bottleneck-resolution";

const ASSIGNED_CANDIDATE_IDS = [
  "acff2383c00f",
  "3061a7d7b78f",
  "ca747f355c14",
  "a0e30984a18d",
  "2f5f144c00c8",
  "3f83160751e7",
  "a0119c861d63",
];

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
  userId: "p151.5-bottleneck",
  email: "p151.5@local",
  name: "P151.5 Bottleneck",
  role: "executive" as const,
  territoryStates: [],
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
};

async function main() {
  loadEnvLocal();
  const liveFlag = process.argv.includes("--live");

  console.error(`[P151.5] Running ${liveFlag ? "live mechanical resolution" : "simulation"}…`);
  const report = await buildBottleneckResolutionReport({
    session,
    candidateIds: ASSIGNED_CANDIDATE_IDS,
    dryRun: !liveFlag,
    applyLive: liveFlag,
  });

  const jsonPath = path.join(process.cwd(), "artifacts", "p151.5-workflow-bottleneck-analysis.json");
  const mdPath = path.join(process.cwd(), "artifacts", "p151.5-workflow-bottleneck-analysis.md");
  await mkdir(path.dirname(jsonPath), { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(mdPath, formatBottleneckResolutionMarkdown(report), "utf8");

  console.log(
    JSON.stringify(
      {
        ok: true,
        jsonPath,
        mdPath,
        dryRun: report.dryRun,
        before: {
          paperworkNeeded: report.before.paperworkNeeded,
          readyForPaperwork: report.before.readyForPaperwork,
          sendPaperwork: report.before.sendPaperwork,
        },
        afterMechanicalResolution: {
          paperworkNeeded: report.afterMechanicalResolution.paperworkNeeded,
          readyForPaperwork: report.afterMechanicalResolution.readyForPaperwork,
          sendPaperwork: report.afterMechanicalResolution.sendPaperwork,
        },
        automationRecommendation: report.automationRecommendation,
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
