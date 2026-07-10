/**
 * P103 read-only verification — writes slim JSON report to disk (no stdout pollution).
 * Usage: npx tsx scripts/p103-run-verification.ts [outputPath]
 */
import { writeFile } from "node:fs/promises";
import { buildPostLiveSendVerification } from "@/lib/post-live-send-verification/build-post-live-send-verification";

async function main(): Promise<void> {
  const outputPath =
    process.argv[2] ?? "/tmp/p103-post-live-send-verification.json";

  const report = await buildPostLiveSendVerification({ verifyDropbox: true });

  const slim = {
    generatedAt: report.generatedAt,
    firstLiveSend: {
      candidateId: report.firstLiveSend.candidateId,
      candidateName: report.firstLiveSend.candidateName,
      email: report.firstLiveSend.email,
      signatureRequestId: report.firstLiveSend.signatureRequestId,
      allPassed: report.firstLiveSend.allPassed,
      checks: report.firstLiveSend.checks,
      dropboxSignReadOnly: report.firstLiveSend.dropboxSignReadOnly,
      workflow: report.firstLiveSend.workflow,
      onboarding: report.firstLiveSend.onboarding,
      duplicateProtection: report.firstLiveSend.duplicateProtection,
      p100AuditEntry: report.firstLiveSend.p100AuditEntry,
    },
    remainingQueue: {
      readyToSend: report.remainingQueue.readyToSend,
      alreadySent: report.remainingQueue.alreadySent,
      blockedExcludingFocus: report.remainingQueue.blockedExcludingFocus,
      invalidEmailCount: report.remainingQueue.invalidEmailCount,
      duplicateRiskCount: report.remainingQueue.duplicateRiskCount,
      allPassed: report.remainingQueue.allPassed,
      checks: report.remainingQueue.checks,
    },
    strategy: {
      recommendedMode: report.strategy.recommendedMode,
      rationale: report.strategy.rationale,
      batchLockRule: report.strategy.batchLockRule,
    },
    goNoGoRemainingSends: report.goNoGoRemainingSends,
    goNoGoReason: report.goNoGoReason,
  };

  await writeFile(outputPath, JSON.stringify(slim, null, 2), "utf8");
  process.stderr.write(`P103 report written to ${outputPath}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
