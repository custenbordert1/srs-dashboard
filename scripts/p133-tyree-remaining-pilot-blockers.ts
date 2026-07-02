/**
 * P133 — Tyree Remaining Pilot Blocker Resolution Plan
 * Usage: npx tsx scripts/p133-tyree-remaining-pilot-blockers.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildTyreeRemainingPilotBlockers } from "@/lib/p133-tyree-remaining-pilot-blockers";

async function main() {
  const report = await buildTyreeRemainingPilotBlockers();
  const artifactPath = path.join(process.cwd(), "artifacts", "p133-tyree-remaining-pilot-blockers.json");
  await mkdir(path.dirname(artifactPath), { recursive: true });

  const artifact = {
    sourcePhase: report.sourcePhase,
    generatedAt: report.generatedAt,
    mode: report.mode,
    targetCandidateId: report.targetCandidateId,
    targetCandidateName: report.targetCandidateName,
    recommendedJobId: report.recommendedJobId,
    p132ResumeFix: report.p132ResumeFix,
    currentScore: report.currentScore,
    currentDecision: report.currentDecision,
    scoreGapToAutoApprove: report.scoreGapToAutoApprove,
    failedGates: report.failedGates,
    passedGateCount: report.passedGateCount,
    failedGateCount: report.failedGateCount,
    remainingFixes: report.remainingFixes,
    manualSteps: report.manualSteps,
    softwareSteps: report.softwareSteps,
    jobRemediation: report.jobRemediation,
    alternativePublishedJobs: report.alternativePublishedJobs,
    recruiterAssignment: report.recruiterAssignment,
    mappingConfidence: report.mappingConfidence,
    p124Approval: report.p124Approval,
    p122PilotReadiness: report.p122PilotReadiness,
    safestFixPlan: report.safestFixPlan,
    expectedPostFixScore: report.expectedPostFixScore,
    expectedPostFixDecision: report.expectedPostFixDecision,
    simulationSteps: report.simulationSteps,
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
        currentScore: report.currentScore,
        failedGateCount: report.failedGateCount,
        p132HasResume: report.p132ResumeFix.hasResume,
        jobRemediationAction: report.jobRemediation.action,
        expectedPostFixScore: report.expectedPostFixScore,
        expectedPostFixDecision: report.expectedPostFixDecision,
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
