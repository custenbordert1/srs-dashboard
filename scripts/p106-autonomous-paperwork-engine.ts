/**
 * P106 — Autonomous Paperwork Engine
 * Usage:
 *   npx tsx scripts/p106-autonomous-paperwork-engine.ts
 *   npx tsx scripts/p106-autonomous-paperwork-engine.ts --mode executeOne
 *   npx tsx scripts/p106-autonomous-paperwork-engine.ts --mode executeSafeSingles
 */
import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { runAutonomousPaperworkEngine } from "@/lib/p106-autonomous-paperwork-engine";
import type { AutonomousPaperworkRunMode } from "@/lib/p106-autonomous-paperwork-engine";

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

function parseMode(): AutonomousPaperworkRunMode {
  const arg = process.argv.find((a) => a.startsWith("--mode="));
  const value = arg?.split("=")[1] ?? (process.argv.includes("--send") ? "executeSafeSingles" : "dryRun");
  if (value === "executeOne" || value === "executeSafeSingles") return value;
  return "dryRun";
}

async function main() {
  loadEnvLocal();
  const mode = parseMode();
  console.error(`[P106] Mode: ${mode}`);

  const result = await runAutonomousPaperworkEngine({
    mode,
    mtdOnly: false,
    executiveApprovalFlag: mode !== "dryRun",
    approvedBy: "P106 Script",
    approvedByUserId: "p106-script",
  });

  const outDir = path.join(process.cwd(), ".data");
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, "p106-autonomous-paperwork-engine.json");
  await writeFile(outPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");

  const artifactPath = path.join(process.cwd(), "artifacts/p106-autonomous-paperwork-engine-dryrun.json");
  await mkdir(path.dirname(artifactPath), { recursive: true });
  if (mode === "dryRun") {
    await writeFile(artifactPath, `${JSON.stringify(result.report, null, 2)}\n`, "utf8");
  }

  console.log(
    JSON.stringify(
      {
        mode: result.mode,
        sendsThisRun: result.sendsThisRun,
        stoppedEarly: result.stoppedEarly,
        stopReason: result.stopReason,
        metrics: result.report.metrics,
        readyToSend: result.report.readyToSend.map((c) => ({
          name: c.candidateName,
          email: c.email,
          position: c.positionTitle,
        })),
        sent: result.report.sent.map((c) => ({
          name: c.candidateName,
          signatureRequestId: c.signatureRequestId,
          sentAt: c.sentAt,
        })),
        blocked: result.report.blocked.map((c) => ({
          name: c.candidateName,
          blocker: c.blockerReason,
          fix: c.recommendedFix,
        })),
        artifactPath: outPath,
        warnings: result.warnings,
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
