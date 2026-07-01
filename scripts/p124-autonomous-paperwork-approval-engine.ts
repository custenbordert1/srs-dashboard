/**
 * P124 — Autonomous Paperwork Approval Engine
 * Usage: npx tsx scripts/p124-autonomous-paperwork-approval-engine.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildApprovalReport } from "@/lib/autonomous-paperwork-approval-engine/build-approval-report";

async function main() {
  const report = await buildApprovalReport();
  const artifactPath = path.join(process.cwd(), "artifacts", "p124-autonomous-paperwork-approval-engine.json");
  await mkdir(path.dirname(artifactPath), { recursive: true });

  const artifact = {
    approvalPolicy: report.policy,
    decisionCounts: {
      autoApproved: report.summary.autoApproved,
      needsHumanApproval: report.summary.needsHumanApproval,
      blocked: report.summary.blocked,
      waiting: report.summary.waiting,
      rejectedForSafety: report.summary.rejectedForSafety,
    },
    averageApprovalScore: report.summary.averageApprovalScore,
    topAutoApprovedCandidates: report.autoApproved.slice(0, 10),
    humanApprovalQueue: report.humanReview.slice(0, 10),
    safetyRejects: report.safetyRejected.slice(0, 10),
    blockerReasons: report.blockers,
    goNoGo: report.goNoGo,
    goNoGoReason: report.goNoGoReason,
    generatedAt: report.generatedAt,
    sourcePhase: report.sourcePhase,
  };

  await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        ok: true,
        artifactPath,
        goNoGo: report.goNoGo,
        autoApproved: report.summary.autoApproved,
        needsHumanApproval: report.summary.needsHumanApproval,
        averageApprovalScore: report.summary.averageApprovalScore,
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
