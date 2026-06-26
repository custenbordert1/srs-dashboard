#!/usr/bin/env npx tsx
/**
 * P73 validation — Autonomous Candidate Communication Engine (preview only).
 */
import { runAutonomousCandidateCommunicationPreview } from "@/lib/autonomous-candidate-communication-engine";
import { buildP73NlAnswers } from "@/lib/autonomous-candidate-communication-engine/build-p73-nl-answers";
import { canExecuteCommunication, loadP73FeatureFlags } from "@/lib/autonomous-candidate-communication-engine/feature-flags-store";
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
  const [store, workflows, onboardingRecords, policy, storedFlags] = await Promise.all([
    readIngestionStore(),
    getCandidateWorkflowState(),
    listAllCandidateOnboardingRecords(),
    loadCandidateOnboardingPolicy(),
    loadP73FeatureFlags(),
  ]);

  const flags = {
    ...storedFlags,
    communicationEnabled: true,
    executionMode: "preview" as const,
    emailEnabled: false,
    smsEnabled: false,
  };

  const candidates = filterMtdCandidates(listIngestedCandidates(store));
  const workflowRows = candidates.map((candidate) =>
    buildScoredWorkflowRow(candidate, workflows[candidate.candidateId]),
  );
  const fetchedAt = store.lastChunkAt ?? store.updatedAt ?? new Date().toISOString();

  const preview = runAutonomousCandidateCommunicationPreview({
    candidates: workflowRows,
    onboardingRecords,
    policy,
    flags,
    fetchedAt,
  });

  const nlAnswer = buildP73NlAnswers({
    queryId: "communication_sent_today",
    candidates: workflowRows,
    onboardingRecords,
    policy,
    flags,
    fetchedAt,
  });

  const { dashboard } = preview;
  const apiExample = {
    ok: true,
    previewMode: true,
    fetchedAt: preview.fetchedAt,
    dashboard: {
      controls: dashboard.controls,
      health: dashboard.health,
      queueSample: dashboard.queue.slice(0, 5),
      warnings: dashboard.warnings,
    },
    warnings: preview.warnings,
  };

  const report = {
    validatedAt: new Date().toISOString(),
    phase: "P73",
    previewMode: true,
    durationMs: Date.now() - started,
    candidateCount: workflowRows.length,
    health: dashboard.health,
    controls: dashboard.controls,
    nlQueryExample: {
      queryId: nlAnswer?.queryId,
      summaryPreview: nlAnswer?.summary.slice(0, 280),
    },
    apiExample,
    productionWrites: false,
    emailsSent: false,
    smsSent: false,
    candidateMutations: false,
    automationExecuted: false,
    liveCommunicationEnabled: canExecuteCommunication(flags),
    warnings: preview.warnings,
  };

  const markdown = `# P73 Validation Report

Validated: ${report.validatedAt}

## Preview safeguards

- Production writes: **no**
- Email delivery: **no**
- SMS delivery: **no**
- Candidate mutations: **no**
- Automation execution: **no**
- Live communication: **${report.liveCommunicationEnabled ? "enabled" : "disabled"}**

## Communication health

| Metric | Value |
|--------|------:|
| Communications today | ${dashboard.health.communicationsToday} |
| Queued | ${dashboard.health.queued} |
| Preview sent | ${dashboard.health.previewSent} |
| Waiting approval | ${dashboard.health.waitingApproval} |
| Failures | ${dashboard.health.failures} |
| Skipped | ${dashboard.health.skipped} |
| Automation % | ${dashboard.health.automationPercent ?? "—"} |
| Recruiter work eliminated | ${dashboard.health.recruiterWorkEliminated} |

## Automation controls

- Status: **${dashboard.controls.communicationEnabled ? "ON" : "OFF"}**
- Execution mode: **${dashboard.controls.executionMode}**
- Email: **${dashboard.controls.emailEnabled ? "Enabled" : "Disabled"}**
- SMS: **${dashboard.controls.smsEnabled ? "Enabled" : "Disabled"}**

## Natural language example

Query: How many communications were sent today?

\`\`\`
${nlAnswer?.summary ?? "N/A"}
\`\`\`

Duration: ${report.durationMs}ms
`;

  const reportPath = resolve(process.cwd(), "docs/p73-validation-report.md");
  writeFileSync(reportPath, markdown);
  console.log(JSON.stringify(report, null, 2));
  console.error(`Wrote ${reportPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
