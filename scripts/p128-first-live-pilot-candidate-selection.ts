/**
 * P128 — First Live Pilot Candidate Selection
 * Usage: npx tsx scripts/p128-first-live-pilot-candidate-selection.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildFirstLivePilotCandidateSelection } from "@/lib/p128-first-live-pilot-candidate-selection";

async function main() {
  const report = await buildFirstLivePilotCandidateSelection();
  const artifactPath = path.join(process.cwd(), "artifacts", "p128-first-live-pilot-candidate-selection.json");
  await mkdir(path.dirname(artifactPath), { recursive: true });

  const artifact = {
    sourcePhase: report.sourcePhase,
    generatedAt: report.generatedAt,
    mode: report.mode,
    p127Summary: report.p127Summary,
    selectedCandidate: report.selectedCandidate,
    backupCandidates: report.backupCandidates,
    safetyChecks: report.safetyChecks,
    sendPacketPreview: report.sendPacketPreview,
    auditPath: report.auditPath,
    exactEnvVarsNeeded: report.exactEnvVarsNeeded,
    allowlistCommand: report.allowlistCommand,
    finalLiveCommand: report.finalLiveCommand,
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
