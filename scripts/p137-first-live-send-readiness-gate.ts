/**
 * P137 — First Live Send Readiness Gate
 * Usage: npx tsx scripts/p137-first-live-send-readiness-gate.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildFirstLiveSendReadinessGate } from "@/lib/p137-first-live-send-readiness-gate";

async function main() {
  const report = await buildFirstLiveSendReadinessGate();
  const artifactPath = path.join(process.cwd(), "artifacts", "p137-first-live-send-readiness-gate.json");
  await mkdir(path.dirname(artifactPath), { recursive: true });

  const artifact = {
    sourcePhase: report.sourcePhase,
    generatedAt: report.generatedAt,
    mode: report.mode,
    p136Summary: report.p136Summary,
    autoApprovedCount: report.autoApprovedCount,
    selectedCandidate: report.selectedCandidate,
    backupCandidates: report.backupCandidates,
    safetyChecklist: report.safetyChecklist,
    safetyChecks: report.safetyChecks,
    sendPacketPreview: report.sendPacketPreview,
    auditPath: report.auditPath,
    exactEnvVarsNeeded: report.exactEnvVarsNeeded,
    allowlistCommand: report.allowlistCommand,
    finalLiveCommand: report.finalLiveCommand,
    confirmationPhrase: report.confirmationPhrase,
    goNoGo: report.goNoGo,
    goNoGoReason: report.goNoGoReason,
    executeBatchCalled: report.executeBatchCalled,
    breezyWrites: report.breezyWrites,
    liveModeEnabled: report.liveModeEnabled,
    paperworkSent: report.paperworkSent,
    continuousRunnerEnabled: report.continuousRunnerEnabled,
  };

  await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        ok: true,
        artifactPath,
        autoApprovedCount: report.autoApprovedCount,
        selectedCandidateId: report.selectedCandidate.candidateId,
        selectedCandidateName: report.selectedCandidate.candidateName,
        approvalScore: report.selectedCandidate.approvalScore,
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
