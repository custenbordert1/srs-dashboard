/**
 * P127 — End-to-End Preview Readiness Drill
 * Usage: npx tsx scripts/p127-end-to-end-preview-readiness-drill.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { runEndToEndPreviewReadinessDrill } from "@/lib/p127-end-to-end-preview-readiness-drill";

async function main() {
  const report = await runEndToEndPreviewReadinessDrill();
  const artifactPath = path.join(process.cwd(), "artifacts", "p127-end-to-end-preview-readiness-drill.json");
  await mkdir(path.dirname(artifactPath), { recursive: true });

  const artifact = {
    sourcePhase: report.sourcePhase,
    generatedAt: report.generatedAt,
    mode: report.mode,
    totalCandidatesEvaluated: report.totalCandidatesEvaluated,
    autoApproved: report.autoApproved,
    humanApproval: report.humanApproval,
    blocked: report.blocked,
    waiting: report.waiting,
    rejectedForSafety: report.rejectedForSafety,
    readyForPilot: report.readyForPilot,
    pilotRecommendation: report.pilotRecommendation,
    safetyGates: report.safetyGates,
    goNoGo: report.goNoGo,
    goNoGoReason: report.goNoGoReason,
    remainingStepsBeforeFirstLiveSend: report.remainingStepsBeforeFirstLiveSend,
    drillSteps: report.drillSteps,
    validations: report.validations,
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
        goNoGo: report.goNoGo,
        totalCandidatesEvaluated: report.totalCandidatesEvaluated,
        autoApproved: report.autoApproved,
        readyForPilot: report.readyForPilot,
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
