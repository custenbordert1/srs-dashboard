#!/usr/bin/env npx tsx
/**
 * P75 validation — Autonomous Operations Center (preview only).
 */
import { runAutonomousOperationsCenterPreview } from "@/lib/autonomous-operations-center";
import { buildP75NlAnswers } from "@/lib/autonomous-operations-center/build-p75-nl-answers";
import { canExecuteOperationsCenter, loadP75FeatureFlags } from "@/lib/autonomous-operations-center/feature-flags-store";
import { loadP71FeatureFlags } from "@/lib/autonomous-paperwork-execution-engine/feature-flags-store";
import { loadP73FeatureFlags } from "@/lib/autonomous-candidate-communication-engine/feature-flags-store";
import { loadP74FeatureFlags } from "@/lib/autonomous-recruiting-orchestrator/feature-flags-store";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { listIngestedCandidates, readIngestionStore } from "@/lib/candidate-ingestion/ingestion-store";
import { listAllCandidateOnboardingRecords } from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import { loadCandidateOnboardingPolicy } from "@/lib/candidate-onboarding-engine/onboarding-policy-store";
import { buildOnboardingSendQueueMetrics } from "@/lib/candidate-onboarding-send-queue/build-send-queue-metrics";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

async function main() {
  const started = Date.now();
  const [store, workflows, onboardingRecords, policy, p71Flags, p73Flags, p74Flags, storedP75Flags, sendQueueMetrics] =
    await Promise.all([
      readIngestionStore(),
      getCandidateWorkflowState(),
      listAllCandidateOnboardingRecords(),
      loadCandidateOnboardingPolicy(),
      loadP71FeatureFlags(),
      loadP73FeatureFlags(),
      loadP74FeatureFlags(),
      loadP75FeatureFlags(),
      buildOnboardingSendQueueMetrics(),
    ]);

  const p75Flags = {
    ...storedP75Flags,
    operationsCenterEnabled: true,
    executionMode: "preview" as const,
    previewMode: true,
  };

  const candidates = listIngestedCandidates(store);
  const workflowRows = candidates.map((candidate) =>
    buildScoredWorkflowRow(candidate, workflows[candidate.candidateId]),
  );
  const fetchedAt = store.lastChunkAt ?? store.updatedAt ?? new Date().toISOString();

  const preview = runAutonomousOperationsCenterPreview({
    candidates,
    workflowRows,
    onboardingRecords,
    policy,
    p71Flags,
    p73Flags: { ...p73Flags, communicationEnabled: true, executionMode: "preview" },
    p74Flags: { ...p74Flags, orchestratorEnabled: true, executionMode: "preview" },
    p75Flags,
    sendQueueMetrics,
    fetchedAt,
  });

  const nlAnswer = buildP75NlAnswers({
    queryId: "operations_anything_broken",
    candidates,
    workflowRows,
    onboardingRecords,
    policy,
    p71Flags,
    p73Flags: { ...p73Flags, communicationEnabled: true, executionMode: "preview" },
    p74Flags: { ...p74Flags, orchestratorEnabled: true, executionMode: "preview" },
    p75Flags,
    sendQueueMetrics,
    fetchedAt,
  });

  const { dashboard } = preview;
  const report = {
    validatedAt: new Date().toISOString(),
    phase: "P75",
    previewMode: true,
    durationMs: Date.now() - started,
    candidateCount: workflowRows.length,
    platformHealth: dashboard.platformHealth.overall,
    systemHealth: dashboard.systemHealth,
    openIncidents: dashboard.executiveMetrics.openIncidents,
    criticalIncidents: dashboard.executiveMetrics.criticalIncidents,
    engineMonitoring: dashboard.engineMonitoring.map((e) => ({ engine: e.label, status: e.status })),
    predictiveRisks: dashboard.predictiveRisks.length,
    nlQueryExample: {
      queryId: nlAnswer?.queryId,
      summaryPreview: nlAnswer?.summary.slice(0, 280),
    },
    productionWrites: false,
    emailsSent: false,
    smsSent: false,
    dropboxSignCalls: false,
    candidateMutations: false,
    automationExecuted: false,
    workflowExecution: false,
    liveOperationsEnabled: canExecuteOperationsCenter(p75Flags),
    defaultFlags: {
      P75_OPERATIONS_CENTER_ENABLED: false,
      P75_EXECUTION_MODE: "preview",
      P75_PREVIEW_MODE: true,
    },
    warnings: preview.warnings,
  };

  const markdown = `# P75 Validation Report

Validated: ${report.validatedAt}

## Preview safeguards

- Production writes: **no**
- Email delivery: **no**
- SMS delivery: **no**
- Dropbox Sign calls: **no**
- Candidate mutations: **no**
- Automation execution: **no**
- Workflow execution: **no**
- Live operations center: **${report.liveOperationsEnabled ? "enabled" : "disabled"}**

## Platform health

| Metric | Value |
|--------|------:|
| Overall health | ${dashboard.platformHealth.overall}% |
| Open incidents | ${dashboard.executiveMetrics.openIncidents} |
| Critical incidents | ${dashboard.executiveMetrics.criticalIncidents} |
| Predicted risks | ${dashboard.predictiveRisks.length} |
| Workflow success rate | ${dashboard.executiveMetrics.workflowSuccessRate ?? "—"}% |

## Cross-engine monitoring

${dashboard.engineMonitoring.map((e) => `- **${e.label}**: ${e.status} — ${e.explanation}`).join("\n")}

## Natural language example

Query: Is anything broken?

\`\`\`
${nlAnswer?.summary ?? "N/A"}
\`\`\`

Duration: ${report.durationMs}ms
`;

  const reportPath = resolve(process.cwd(), "docs/p75-validation-report.md");
  writeFileSync(reportPath, markdown);
  console.log(JSON.stringify(report, null, 2));
  console.error(`Wrote ${reportPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
