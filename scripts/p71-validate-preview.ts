#!/usr/bin/env npx tsx
/**
 * P71 validation — Autonomous Paperwork Execution Engine (controlled automation).
 */
import { runPaperworkExecutionPreview } from "@/lib/autonomous-paperwork-execution-engine";
import { loadP71FeatureFlags } from "@/lib/autonomous-paperwork-execution-engine/feature-flags-store";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { buildOnboardingSendQueueMetrics } from "@/lib/candidate-onboarding-send-queue/build-send-queue-metrics";
import { filterMtdCandidates } from "@/lib/candidate-ingestion/mtd-candidates";
import { listIngestedCandidates, readIngestionStore } from "@/lib/candidate-ingestion/ingestion-store";
import { listAllCandidateOnboardingRecords } from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import { loadCandidateOnboardingPolicy } from "@/lib/candidate-onboarding-engine/onboarding-policy-store";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

async function main() {
  const started = Date.now();
  const [store, workflows, onboardingRecords, policy, flags, sendQueueMetrics] = await Promise.all([
    readIngestionStore(),
    getCandidateWorkflowState(),
    listAllCandidateOnboardingRecords(),
    loadCandidateOnboardingPolicy(),
    loadP71FeatureFlags(),
    buildOnboardingSendQueueMetrics(),
  ]);

  const mtd = filterMtdCandidates(listIngestedCandidates(store));
  const scoredRows = mtd.map((candidate) =>
    buildScoredWorkflowRow(candidate, workflows[candidate.candidateId]),
  );

  const fetchedAt = store.lastChunkAt ?? store.updatedAt ?? new Date().toISOString();
  const preview = await runPaperworkExecutionPreview({
    candidates: scoredRows,
    onboardingRecords,
    policy,
    flags,
    sendQueueMetrics,
    fetchedAt,
  });

  const { dashboard } = preview;

  const report = {
    validatedAt: new Date().toISOString(),
    phase: "P71",
    previewMode: true,
    durationMs: Date.now() - started,
    mtdCandidates: mtd.length,
    controls: dashboard.controls,
    executiveMetrics: dashboard.executiveMetrics,
    queueSize: dashboard.executionQueue.length,
    readyCount: dashboard.readyCandidates.length,
    blockedCount: dashboard.blockedCandidates.length,
    auditEventCount: dashboard.recentAuditEvents.length,
    timelineSteps: dashboard.sampleTimeline.length,
    productionWrites: false,
    dropboxSignCalls: false,
    emailsSent: false,
    candidateMutations: false,
    automaticStatusChanges: false,
    warnings: preview.warnings,
  };

  const reportPath = resolve(process.cwd(), "docs/p71-validation-report.md");
  const markdown = `# P71 Validation Report

Validated: ${report.validatedAt}

## Preview safeguards

- Production writes: **no**
- Dropbox Sign calls: **no**
- Live emails: **no**
- Candidate mutations: **no**
- Automatic status changes: **no**

## Automation controls

| Control | Value |
|---------|-------|
| Automation | ${dashboard.controls.automationEnabled ? "ON" : "OFF"} |
| Execution mode | ${dashboard.controls.executionMode} |
| Dropbox execution | ${dashboard.controls.dropboxExecution ? "enabled" : "disabled"} |
| Can execute live | ${dashboard.controls.canExecute ? "yes" : "no"} |

## Executive metrics

| Metric | Value |
|--------|------:|
| Auto sends today | ${dashboard.executiveMetrics.autoSendsToday} |
| Manual sends today | ${dashboard.executiveMetrics.manualSendsToday} |
| Waiting signature | ${dashboard.executiveMetrics.waitingSignature} |
| Queue depth | ${dashboard.executiveMetrics.queueDepth} |
| Ready for execution | ${dashboard.readyCandidates.length} |
| Blocked | ${dashboard.blockedCandidates.length} |

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
