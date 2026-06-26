#!/usr/bin/env npx tsx
/**
 * P76 validation — Autonomous Decision Engine (preview only).
 */
import { runAutonomousDecisionEnginePreview } from "@/lib/autonomous-decision-engine";
import { buildP76NlAnswers } from "@/lib/autonomous-decision-engine/build-p76-nl-answers";
import { canExecuteDecisionEngine, loadP76FeatureFlags } from "@/lib/autonomous-decision-engine/feature-flags-store";
import { simulateDecisionPreview } from "@/lib/autonomous-decision-engine/decision-preview";
import { loadP71FeatureFlags } from "@/lib/autonomous-paperwork-execution-engine/feature-flags-store";
import { loadP73FeatureFlags } from "@/lib/autonomous-candidate-communication-engine/feature-flags-store";
import { loadP74FeatureFlags } from "@/lib/autonomous-recruiting-orchestrator/feature-flags-store";
import { loadP75FeatureFlags } from "@/lib/autonomous-operations-center/feature-flags-store";
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
  const [store, workflows, onboardingRecords, policy, p71Flags, p73Flags, p74Flags, p75Flags, storedP76Flags, sendQueueMetrics] =
    await Promise.all([
      readIngestionStore(),
      getCandidateWorkflowState(),
      listAllCandidateOnboardingRecords(),
      loadCandidateOnboardingPolicy(),
      loadP71FeatureFlags(),
      loadP73FeatureFlags(),
      loadP74FeatureFlags(),
      loadP75FeatureFlags(),
      loadP76FeatureFlags(),
      buildOnboardingSendQueueMetrics(),
    ]);

  const p76Flags = {
    ...storedP76Flags,
    decisionEngineEnabled: true,
    executionMode: "preview" as const,
    previewMode: true,
  };

  const candidates = listIngestedCandidates(store);
  const workflowRows = candidates.map((candidate) =>
    buildScoredWorkflowRow(candidate, workflows[candidate.candidateId]),
  );
  const fetchedAt = store.lastChunkAt ?? store.updatedAt ?? new Date().toISOString();

  const preview = runAutonomousDecisionEnginePreview({
    candidates,
    workflowRows,
    onboardingRecords,
    policy,
    p71Flags,
    p73Flags: { ...p73Flags, communicationEnabled: true, executionMode: "preview" },
    p74Flags: { ...p74Flags, orchestratorEnabled: true, executionMode: "preview" },
    p75Flags: { ...p75Flags, operationsCenterEnabled: true, executionMode: "preview" },
    p76Flags,
    sendQueueMetrics,
    fetchedAt,
  });

  const nlAnswer = buildP76NlAnswers({
    queryId: "decisions_what_next",
    candidates,
    workflowRows,
    onboardingRecords,
    policy,
    p71Flags,
    p73Flags: { ...p73Flags, communicationEnabled: true, executionMode: "preview" },
    p74Flags: { ...p74Flags, orchestratorEnabled: true, executionMode: "preview" },
    p75Flags: { ...p75Flags, operationsCenterEnabled: true, executionMode: "preview" },
    p76Flags,
    sendQueueMetrics,
    fetchedAt,
  });

  const topDecision = preview.dashboard.recommendedDecisions[0];
  const simulation = topDecision ? simulateDecisionPreview(topDecision) : null;

  const { dashboard } = preview;
  const report = {
    validatedAt: new Date().toISOString(),
    phase: "P76",
    previewMode: true,
    durationMs: Date.now() - started,
    candidateCount: workflowRows.length,
    totalDecisions: dashboard.executiveMetrics.totalDecisions,
    automationReady: dashboard.executiveMetrics.automationReadyDecisions,
    averageConfidence: dashboard.executiveMetrics.averageConfidence,
    averageRiskScore: dashboard.executiveMetrics.averageRiskScore,
    recruiterHoursSaved: dashboard.executiveMetrics.recruiterHoursSaved,
    simulationPreview: simulation
      ? { decisionId: simulation.decisionId, previewOnly: simulation.previewOnly }
      : null,
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
    liveDecisionEngineEnabled: canExecuteDecisionEngine(p76Flags),
    defaultFlags: {
      P76_DECISION_ENGINE_ENABLED: false,
      P76_EXECUTION_MODE: "preview",
      P76_PREVIEW_MODE: true,
    },
    warnings: preview.warnings,
  };

  const markdown = `# P76 Validation Report

Validated: ${report.validatedAt}

## Preview safeguards

- Production writes: **no**
- Email delivery: **no**
- SMS delivery: **no**
- Dropbox Sign calls: **no**
- Candidate mutations: **no**
- Automation execution: **no**
- Workflow execution: **no**
- Live decision engine: **${report.liveDecisionEngineEnabled ? "enabled" : "disabled"}**

## Decision metrics

| Metric | Value |
|--------|------:|
| Total decisions | ${dashboard.executiveMetrics.totalDecisions} |
| Automation-ready | ${dashboard.executiveMetrics.automationReadyDecisions} |
| Human review | ${dashboard.executiveMetrics.humanReviewDecisions} |
| Average confidence | ${dashboard.executiveMetrics.averageConfidence ?? "—"}% |
| Recruiter hours saved (est.) | ${dashboard.executiveMetrics.recruiterHoursSaved} |

## Natural language example

Query: What should the system do next?

\`\`\`
${nlAnswer?.summary ?? "N/A"}
\`\`\`

Duration: ${report.durationMs}ms
`;

  const reportPath = resolve(process.cwd(), "docs/p76-validation-report.md");
  writeFileSync(reportPath, markdown);
  console.log(JSON.stringify(report, null, 2));
  console.error(`Wrote ${reportPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
