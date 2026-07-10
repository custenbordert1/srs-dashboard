/**
 * P122 — Controlled Live Paperwork Pilot
 * Usage:
 *   npx tsx scripts/p122-controlled-live-paperwork-pilot.ts
 *   npx tsx scripts/p122-controlled-live-paperwork-pilot.ts --execute --confirm "SEND 1 PAPERWORK PACKET" --candidate-id <id>
 */
import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  formatPilotSendPreviewLines,
  p122PilotArtifactPath,
  runControlledLivePaperworkPilot,
} from "@/lib/p122-controlled-live-paperwork-pilot";

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

function parseArgs(argv: string[]) {
  const execute = argv.includes("--execute");
  const confirmIndex = argv.indexOf("--confirm");
  const candidateIndex = argv.indexOf("--candidate-id");
  return {
    dryRun: !execute,
    confirmationPhrase: confirmIndex >= 0 ? argv[confirmIndex + 1] : undefined,
    candidateId: candidateIndex >= 0 ? argv[candidateIndex + 1] : undefined,
  };
}

async function main() {
  loadEnvLocal();
  const args = parseArgs(process.argv.slice(2));

  const result = await runControlledLivePaperworkPilot({
    dryRun: args.dryRun,
    confirmationPhrase: args.confirmationPhrase,
    candidateId: args.candidateId,
    byUserId: "p122-controlled-live-paperwork-pilot-script",
  });

  if (result.sendPacketPreview) {
    console.error("[P122] Final send packet preview:");
    for (const line of formatPilotSendPreviewLines(result.sendPacketPreview)) {
      console.error(`[P122] ${line}`);
    }
  }

  const artifact = {
    pilotConfig: result.report.pilotConfig,
    evaluatedCandidates: result.report.evaluatedCandidates,
    eligiblePilotCandidates: result.report.eligiblePilotCandidates,
    blockedCandidates: result.report.blockedCandidates,
    safetyChecks: [...result.report.systemSafetyChecks, ...(result.sendPacketPreview?.safetyChecks ?? [])],
    sendPacketPreview: result.sendPacketPreview,
    sendResult: result.sendResult,
    auditRecordPath: result.report.auditRecordPath,
    pilotRegistryPath: result.report.pilotRegistryPath,
    goNoGo: result.report.goNoGo,
    goNoGoReason: result.report.goNoGoReason,
    executedMode: result.executedMode,
    warnings: result.report.warnings,
  };

  await mkdir(path.dirname(p122PilotArtifactPath()), { recursive: true });
  await writeFile(p122PilotArtifactPath(), `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        ok: true,
        artifactPath: p122PilotArtifactPath(),
        goNoGo: result.report.goNoGo,
        executedMode: result.executedMode,
        sendResult: result.sendResult,
        previewLines: result.sendPacketPreview ? formatPilotSendPreviewLines(result.sendPacketPreview) : [],
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
