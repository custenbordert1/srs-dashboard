/**
 * P134 — Autonomous Paperwork Remediation Engine
 * Usage: npx tsx scripts/p134-paperwork-remediation-engine.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildPaperworkRemediationReport } from "@/lib/p134-paperwork-remediation-engine";

async function main() {
  const report = await buildPaperworkRemediationReport();
  const artifactPath = path.join(process.cwd(), "artifacts", "p134-paperwork-remediation-engine.json");
  await mkdir(path.dirname(artifactPath), { recursive: true });

  const artifact = {
    sourcePhase: report.sourcePhase,
    generatedAt: report.generatedAt,
    mode: report.mode,
    summary: report.summary,
    blockersByCategory: report.blockersByCategory,
    tierCounts: report.tierCounts,
    closestToAutoApproved: report.closestToAutoApproved,
    approvalsUnlockedByFix: report.approvalsUnlockedByFix,
    topRecurringRootCauses: report.topRecurringRootCauses,
    executivePanel: report.executivePanel,
    candidatePlans: report.candidatePlans.slice(0, 50),
    candidatePlansTruncated: report.candidatePlans.length > 50,
    totalCandidatePlans: report.candidatePlans.length,
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
        blockedCandidates: report.summary.blockedCandidateCount,
        tier1: report.summary.tier1Count,
        tier2: report.summary.tier2Count,
        tier3: report.summary.tier3Count,
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
