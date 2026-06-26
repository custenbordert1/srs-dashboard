#!/usr/bin/env npx tsx
/**
 * P70 validation — Autonomous Paperwork Engine (preview only).
 */
import { runAutonomousPaperworkPreview } from "@/lib/autonomous-paperwork-engine";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { filterMtdCandidates } from "@/lib/candidate-ingestion/mtd-candidates";
import { listIngestedCandidates, readIngestionStore } from "@/lib/candidate-ingestion/ingestion-store";
import { listAllCandidateOnboardingRecords } from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import { loadCandidateOnboardingPolicy } from "@/lib/candidate-onboarding-engine/onboarding-policy-store";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

async function main() {
  const started = Date.now();
  const [store, workflows, onboardingRecords, policy] = await Promise.all([
    readIngestionStore(),
    getCandidateWorkflowState(),
    listAllCandidateOnboardingRecords(),
    loadCandidateOnboardingPolicy(),
  ]);

  const mtd = filterMtdCandidates(listIngestedCandidates(store));
  const scoredRows = mtd.map((candidate) =>
    buildScoredWorkflowRow(candidate, workflows[candidate.candidateId]),
  );

  const fetchedAt = store.lastChunkAt ?? store.updatedAt ?? new Date().toISOString();
  const preview = runAutonomousPaperworkPreview({
    candidates: scoredRows,
    onboardingRecords,
    policy,
    fetchedAt,
  });

  const { dashboard } = preview;
  const sampleQueue = dashboard.candidateQueue[0] ?? null;
  const topRecruiter = dashboard.recruiterMetrics[0] ?? null;

  const report = {
    validatedAt: new Date().toISOString(),
    phase: "P70",
    previewMode: true,
    durationMs: Date.now() - started,
    mtdCandidates: mtd.length,
    todayActivity: dashboard.todayActivity,
    executiveMetrics: dashboard.executiveMetrics,
    automationReadiness: dashboard.automationReadiness,
    queueSize: dashboard.candidateQueue.length,
    waitingTooLong: dashboard.waitingTooLong.length,
    failedPackets: dashboard.failedPackets.length,
    recruiterCount: dashboard.recruiterMetrics.length,
    topRecruiter: topRecruiter
      ? {
          recruiter: topRecruiter.recruiter,
          manualSends: topRecruiter.manualSends,
          autoSends: topRecruiter.autoSends,
        }
      : null,
    sampleQueueRow: sampleQueue
      ? {
          candidateId: sampleQueue.candidateId,
          name: sampleQueue.candidateName,
          status: sampleQueue.lifecycleStatus,
          source: sampleQueue.sendSource,
          elapsed: sampleQueue.elapsedLabel,
          retries: sampleQueue.retryCount,
        }
      : null,
    productionWrites: false,
    dropboxSignCalls: false,
    emailsSent: false,
    automationExecuted: false,
    warnings: preview.warnings,
  };

  const reportPath = resolve(process.cwd(), "docs/p70-validation-report.md");
  const markdown = `# P70 Validation Report

Validated: ${report.validatedAt}

## Preview mode safeguards

- Production writes: **no**
- Dropbox Sign calls: **no**
- Live emails: **no**
- Automatic execution: **no**

## Today's activity

| Metric | Value |
|--------|------:|
| Paperwork sent today | ${dashboard.todayActivity.paperworkSentToday} |
| Auto sent | ${dashboard.todayActivity.autoSentToday} |
| Manual sent | ${dashboard.todayActivity.manualSentToday} |
| Signed today | ${dashboard.todayActivity.signedToday} |
| Pending signature | ${dashboard.todayActivity.pendingSignature} |
| Failed | ${dashboard.todayActivity.failed} |

## Automation readiness

- Ready for auto send: **${dashboard.automationReadiness.readyForAutoSend}**
- Blocked: **${dashboard.automationReadiness.blocked}**

## Pipeline health

- Queue rows: **${dashboard.candidateQueue.length}**
- Waiting 48h+: **${dashboard.waitingTooLong.length}**
- Failed packets: **${dashboard.failedPackets.length}**
- Auto send %: **${dashboard.executiveMetrics.autoSendPercent ?? "—"}**
- Failure rate: **${dashboard.executiveMetrics.failureRate ?? "—"}%**

Duration: ${report.durationMs}ms · MTD candidates: ${mtd.length}
`;

  writeFileSync(reportPath, markdown, "utf8");
  console.log(JSON.stringify(report, null, 2));
  console.error(`\nWrote ${reportPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
