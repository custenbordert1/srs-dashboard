/**
 * P130 — First AUTO_APPROVED Candidate Data Fix Plan
 * Usage: npx tsx scripts/p130-first-auto-approved-candidate-fix-plan.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildFirstAutoApprovedCandidateFixPlan } from "@/lib/p130-first-auto-approved-candidate-fix-plan";

async function main() {
  const report = await buildFirstAutoApprovedCandidateFixPlan();
  const artifactPath = path.join(
    process.cwd(),
    "artifacts",
    "p130-first-auto-approved-candidate-fix-plan.json",
  );
  await mkdir(path.dirname(artifactPath), { recursive: true });

  const artifact = {
    sourcePhase: report.sourcePhase,
    generatedAt: report.generatedAt,
    mode: report.mode,
    targetCandidateId: report.targetCandidateId,
    targetCandidateName: report.targetCandidateName,
    policy: report.policy,
    currentState: report.currentState,
    requiredFixes: report.requiredFixes,
    simulation: report.simulation,
    manualChecklist: report.manualChecklist,
    cannotFixSafely: report.cannotFixSafely,
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
        currentScore: report.currentState.approvalScore,
        currentDecision: report.currentState.approvalDecision,
        postFixScore: report.simulation.postFixScore,
        postFixDecision: report.simulation.postFixDecision,
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
