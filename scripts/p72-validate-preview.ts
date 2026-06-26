#!/usr/bin/env npx tsx
/**
 * P72 validation — Executive Daily Brief (preview only).
 */
import { runExecutiveDailyBriefPreview } from "@/lib/executive-daily-brief";
import { buildDailyBriefNlAnswer } from "@/lib/executive-daily-brief/build-daily-brief-nl-answers";
import { loadP71FeatureFlags } from "@/lib/autonomous-paperwork-execution-engine/feature-flags-store";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { buildOnboardingSendQueueMetrics } from "@/lib/candidate-onboarding-send-queue/build-send-queue-metrics";
import { listIngestedCandidates, readIngestionStore } from "@/lib/candidate-ingestion/ingestion-store";
import { listAllCandidateOnboardingRecords } from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import { loadCandidateOnboardingPolicy } from "@/lib/candidate-onboarding-engine/onboarding-policy-store";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import { parseMelOpportunities } from "@/lib/mel-matching/mel-opportunity-parser";
import { fetchMelProjectsSheet } from "@/lib/mel-projects-sheet";
import { buildRepIntelligenceWithGeocoding } from "@/lib/rep-intelligence/build-rep-intelligence";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

async function main() {
  const started = Date.now();
  const [store, workflows, melResult, onboardingRecords, policy, flags, sendQueueMetrics] =
    await Promise.all([
      readIngestionStore(),
      getCandidateWorkflowState(),
      fetchMelProjectsSheet(),
      listAllCandidateOnboardingRecords(),
      loadCandidateOnboardingPolicy(),
      loadP71FeatureFlags(),
      buildOnboardingSendQueueMetrics(),
    ]);

  const candidates = listIngestedCandidates(store);
  const workflowRows = candidates.map((candidate) =>
    buildScoredWorkflowRow(candidate, workflows[candidate.candidateId]),
  );
  const fetchedAt = store.lastChunkAt ?? store.updatedAt ?? new Date().toISOString();

  const opportunities = melResult.ok ? parseMelOpportunities(melResult.rows) : [];
  const repSnapshot = melResult.ok
    ? await buildRepIntelligenceWithGeocoding(melResult.rows, melResult.fetchedAt)
    : null;

  const preview = runExecutiveDailyBriefPreview({
    candidates,
    workflowRows,
    onboardingRecords,
    policy,
    flags,
    sendQueueMetrics,
    opportunities: melResult.ok ? opportunities : undefined,
    activeReps: repSnapshot?.activeReps,
    fetchedAt,
  });

  const nlAnswer = buildDailyBriefNlAnswer({
    queryId: "brief_how_are_we_doing",
    candidates,
    workflowRows,
    onboardingRecords,
    policy,
    flags,
    sendQueueMetrics,
    opportunities: melResult.ok ? opportunities : undefined,
    activeReps: repSnapshot?.activeReps,
    fetchedAt,
  });

  const { brief } = preview;
  const apiExample = {
    ok: true,
    previewMode: true,
    fetchedAt: preview.fetchedAt,
    brief: {
      greeting: brief.greeting,
      metrics: brief.metrics,
      automation: brief.automation,
      marketsNeedingGrowth: brief.marketsNeedingGrowth.slice(0, 3),
      risks: brief.risks,
      lastDataRefresh: brief.lastDataRefresh,
    },
    warnings: preview.warnings,
  };

  const report = {
    validatedAt: new Date().toISOString(),
    phase: "P72",
    previewMode: true,
    durationMs: Date.now() - started,
    melAvailable: melResult.ok,
    metrics: brief.metrics,
    automation: brief.automation,
    nlQueryExample: {
      queryId: nlAnswer?.queryId,
      summaryPreview: nlAnswer?.summary.slice(0, 280),
    },
    apiExample,
    productionWrites: false,
    dropboxSignCalls: false,
    emailsSent: false,
    candidateMutations: false,
    automationExecuted: false,
    p71LiveSendsEnabled: brief.automation.liveSendsEnabled,
    warnings: preview.warnings,
  };

  const reportPath = resolve(process.cwd(), "docs/p72-validation-report.md");
  const markdown = `# P72 Validation Report

Validated: ${report.validatedAt}

## Preview safeguards

- Production writes: **no**
- Dropbox Sign calls: **no**
- Live emails: **no**
- Candidate mutations: **no**
- Automation execution: **no**
- P71 live sends: **${brief.automation.liveSendsEnabled ? "enabled" : "disabled"}**

## Executive Daily Brief metrics

| Metric | Value |
|--------|------:|
| Applicants today | ${brief.metrics.applicantsToday} |
| Applicants vs yesterday | ${brief.metrics.applicantsDelta >= 0 ? "+" : ""}${brief.metrics.applicantsDelta} |
| Paperwork sent today | ${brief.metrics.paperworkSentToday} |
| Paperwork signed today | ${brief.metrics.paperworkSignedToday} |
| Pending signatures | ${brief.metrics.pendingSignatures} |
| Waiting 48+ hours | ${brief.metrics.waitingOver48Hours} |
| Ready for work today | ${brief.metrics.readyForWorkToday} |
| Human review | ${brief.metrics.humanReviewCount} |
| Failed packets | ${brief.metrics.failedPackets} |
| Top source | ${brief.metrics.topRecruitingSource ?? "—"} |

## Automation status

- Execution: **${brief.automation.statusLabel}**
- Live sends: **${brief.automation.liveSendsEnabled ? "Enabled" : "Disabled"}**

## Natural language example

Query: How are we doing today?

\`\`\`
${nlAnswer?.summary.slice(0, 500) ?? "—"}
\`\`\`

Duration: ${report.durationMs}ms
`;

  writeFileSync(reportPath, markdown, "utf8");
  console.log(JSON.stringify(report, null, 2));
  console.error(`\nWrote ${reportPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
