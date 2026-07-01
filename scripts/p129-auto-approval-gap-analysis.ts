/**
 * P129 — Auto-Approval Gap Analysis
 * Usage: npx tsx scripts/p129-auto-approval-gap-analysis.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildAutoApprovalGapAnalysis } from "@/lib/p129-auto-approval-gap-analysis";

async function main() {
  const report = await buildAutoApprovalGapAnalysis();
  const artifactPath = path.join(process.cwd(), "artifacts", "p129-auto-approval-gap-analysis.json");
  await mkdir(path.dirname(artifactPath), { recursive: true });

  const artifact = {
    sourcePhase: report.sourcePhase,
    generatedAt: report.generatedAt,
    mode: report.mode,
    policy: report.policy,
    summary: report.summary,
    nearReadyCandidates: report.nearReadyCandidates,
    topBlockers: report.topBlockers,
    policyFindings: report.policyFindings,
    dataQualityFindings: report.dataQualityFindings,
    safestPathToFirstAutoApproved: report.safestPathToFirstAutoApproved,
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
        autoApprovedCount: report.summary.autoApprovedCount,
        nearReadyCount: report.summary.nearReadyCount,
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
