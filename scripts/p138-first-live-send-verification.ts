/**
 * P138 — First Live Send Verification & Automatic Safety Lock
 * Usage: npx tsx scripts/p138-first-live-send-verification.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildFirstLiveSendVerification } from "@/lib/p138-first-live-send-verification";

async function main() {
  const candidateId = process.argv.find((arg) => arg.startsWith("--candidate-id="))?.split("=")[1];
  const verifyDropbox = process.argv.includes("--verify-dropbox");

  const report = await buildFirstLiveSendVerification({
    candidateId,
    verifyDropbox,
    applySafetyLock: true,
  });

  const artifactPath = path.join(process.cwd(), "artifacts", "p138-first-live-send-verification.json");
  await mkdir(path.dirname(artifactPath), { recursive: true });

  const artifact = {
    sourcePhase: report.sourcePhase,
    generatedAt: report.generatedAt,
    mode: report.mode,
    candidate: report.candidate,
    verificationChecklist: report.verificationChecklist,
    auditVerification: report.auditVerification,
    duplicateVerification: report.duplicateVerification,
    safetyLockStatus: report.safetyLockStatus,
    overallResult: report.overallResult,
    goNoGo: report.goNoGo,
    goNoGoReason: report.goNoGoReason,
    recommendations: report.recommendations,
    executivePanel: report.executivePanel,
    executeBatchCalled: report.executeBatchCalled,
    breezyWrites: report.breezyWrites,
    liveModeEnabled: report.liveModeEnabled,
    paperworkSent: report.paperworkSent,
  };

  await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        ok: true,
        artifactPath,
        candidateId: report.candidate.candidateId,
        overallResult: report.overallResult,
        pilotLockApplied: report.safetyLockStatus.applied,
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
