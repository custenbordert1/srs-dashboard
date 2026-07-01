/**
 * P131 — Manual Fix Verification & First Pilot Recheck
 * Usage: npx tsx scripts/p131-manual-fix-verification-first-pilot-recheck.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildManualFixVerificationFirstPilotRecheck } from "@/lib/p131-manual-fix-verification-first-pilot-recheck";

async function main() {
  const report = await buildManualFixVerificationFirstPilotRecheck();
  const artifactPath = path.join(
    process.cwd(),
    "artifacts",
    "p131-manual-fix-verification-first-pilot-recheck.json",
  );
  await mkdir(path.dirname(artifactPath), { recursive: true });

  const artifact = {
    sourcePhase: report.sourcePhase,
    generatedAt: report.generatedAt,
    mode: report.mode,
    targetCandidateId: report.targetCandidateId,
    targetCandidateName: report.targetCandidateName,
    recommendedJobId: report.recommendedJobId,
    verification: report.verification,
    p124Approval: report.p124Approval,
    p123Orchestrator: report.p123Orchestrator,
    p128PilotSelection: report.p128PilotSelection,
    p122PilotReadiness: report.p122PilotReadiness,
    autoApproved: report.autoApproved,
    approvalScore: report.approvalScore,
    finalAllowlistCommand: report.finalAllowlistCommand,
    finalLiveCommandPreview: report.finalLiveCommandPreview,
    exactEnvVarsNeeded: report.exactEnvVarsNeeded,
    goNoGo: report.goNoGo,
    goNoGoReason: report.goNoGoReason,
    executeBatchCalled: report.executeBatchCalled,
    breezyWrites: report.breezyWrites,
    liveModeEnabled: report.liveModeEnabled,
    paperworkSent: report.paperworkSent,
    thresholdChanged: report.thresholdChanged,
  };

  await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        ok: true,
        artifactPath,
        allPassed: report.verification.allPassed,
        autoApproved: report.autoApproved,
        approvalScore: report.approvalScore,
        p122Ready: report.p122PilotReadiness.readyToSend,
        goNoGo: report.goNoGo,
        executeBatchCalled: false,
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
