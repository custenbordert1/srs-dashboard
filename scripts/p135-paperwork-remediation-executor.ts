/**
 * P135 — Autonomous Paperwork Remediation Executor
 * Usage: npx tsx scripts/p135-paperwork-remediation-executor.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { runRemediationExecutorPreview } from "@/lib/p135-paperwork-remediation-executor";

async function main() {
  const report = await runRemediationExecutorPreview({ maxCandidates: 30, tierFilter: [1, 2] });
  const artifactPath = path.join(process.cwd(), "artifacts", "p135-paperwork-remediation-executor.json");
  await mkdir(path.dirname(artifactPath), { recursive: true });

  const artifact = {
    sourcePhase: report.sourcePhase,
    generatedAt: report.generatedAt,
    mode: report.mode,
    previewOnly: report.previewOnly,
    summary: report.summary,
    executivePanel: report.executivePanel,
    humanTaskQueue: report.humanTaskQueue.slice(0, 50),
    candidateResults: report.candidateResults.slice(0, 20),
    candidateResultsTruncated: report.candidateResults.length > 20,
    totalCandidateResults: report.candidateResults.length,
    goNoGo: report.goNoGo,
    goNoGoReason: report.goNoGoReason,
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
        candidatesProcessed: report.summary.candidatesProcessed,
        automaticFixesCompleted: report.summary.automaticFixesCompleted,
        manualFixesRemaining: report.summary.manualFixesRemaining,
        estimatedApprovalsUnlocked: report.summary.estimatedApprovalsUnlocked,
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
