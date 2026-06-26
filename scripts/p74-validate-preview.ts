#!/usr/bin/env npx tsx
/**
 * P74 validation — Autonomous Recruiting Orchestrator (preview only).
 */
import { runAutonomousRecruitingOrchestratorPreview } from "@/lib/autonomous-recruiting-orchestrator";
import { buildP74NlAnswers } from "@/lib/autonomous-recruiting-orchestrator/build-p74-nl-answers";
import { canExecuteOrchestrator, loadP74FeatureFlags } from "@/lib/autonomous-recruiting-orchestrator/feature-flags-store";
import { loadP71FeatureFlags } from "@/lib/autonomous-paperwork-execution-engine/feature-flags-store";
import { loadP73FeatureFlags } from "@/lib/autonomous-candidate-communication-engine/feature-flags-store";
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
  const [store, workflows, onboardingRecords, policy, p71Flags, p73Flags, storedP74Flags, sendQueueMetrics] =
    await Promise.all([
      readIngestionStore(),
      getCandidateWorkflowState(),
      listAllCandidateOnboardingRecords(),
      loadCandidateOnboardingPolicy(),
      loadP71FeatureFlags(),
      loadP73FeatureFlags(),
      loadP74FeatureFlags(),
      buildOnboardingSendQueueMetrics(),
    ]);

  const p74Flags = {
    ...storedP74Flags,
    orchestratorEnabled: true,
    executionMode: "preview" as const,
    previewMode: true,
  };

  const candidates = listIngestedCandidates(store);
  const workflowRows = candidates.map((candidate) =>
    buildScoredWorkflowRow(candidate, workflows[candidate.candidateId]),
  );
  const fetchedAt = store.lastChunkAt ?? store.updatedAt ?? new Date().toISOString();

  const preview = runAutonomousRecruitingOrchestratorPreview({
    candidates,
    workflowRows,
    onboardingRecords,
    policy,
    p71Flags,
    p73Flags: { ...p73Flags, communicationEnabled: true, executionMode: "preview" },
    p74Flags,
    sendQueueMetrics,
    fetchedAt,
  });

  const nlAnswer = buildP74NlAnswers({
    queryId: "orchestrator_system_status",
    candidates,
    workflowRows,
    onboardingRecords,
    policy,
    p71Flags,
    p73Flags: { ...p73Flags, communicationEnabled: true, executionMode: "preview" },
    p74Flags,
    sendQueueMetrics,
    fetchedAt,
  });

  const { dashboard } = preview;
  const report = {
    validatedAt: new Date().toISOString(),
    phase: "P74",
    previewMode: true,
    durationMs: Date.now() - started,
    candidateCount: workflowRows.length,
    readinessScore: dashboard.readinessScore.overall,
    workflowHealth: dashboard.workflowHealth,
    engineHealth: dashboard.engineHealth.map((e) => ({ engine: e.label, status: e.status })),
    executiveMetrics: dashboard.executiveMetrics,
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
    liveOrchestratorEnabled: canExecuteOrchestrator(p74Flags),
    defaultFlags: {
      P74_ORCHESTRATOR_ENABLED: false,
      P74_EXECUTION_MODE: "preview",
      P74_PREVIEW_MODE: true,
    },
    warnings: preview.warnings,
  };

  const markdown = `# P74 Validation Report

Validated: ${report.validatedAt}

## Preview safeguards

- Production writes: **no**
- Email delivery: **no**
- SMS delivery: **no**
- Dropbox Sign calls: **no**
- Candidate mutations: **no**
- Automation execution: **no**
- Workflow execution: **no**
- Live orchestrator: **${report.liveOrchestratorEnabled ? "enabled" : "disabled"}**

## Automation readiness

| Metric | Value |
|--------|------:|
| Overall score | ${dashboard.readinessScore.overall}% |
| Healthy workflows | ${dashboard.workflowHealth.healthy} |
| Warning workflows | ${dashboard.workflowHealth.warning} |
| Blocked workflows | ${dashboard.workflowHealth.blocked} |
| Ready for automation | ${dashboard.executiveMetrics.readyForExecution} |
| Recruiter time saved | ${dashboard.executiveMetrics.recruiterTimeSaved} |

## Cross-engine health

${dashboard.engineHealth.map((e) => `- **${e.label}**: ${e.status} — ${e.explanation}`).join("\n")}

## Natural language example

Query: What is the system doing right now?

\`\`\`
${nlAnswer?.summary ?? "N/A"}
\`\`\`

Duration: ${report.durationMs}ms
`;

  const reportPath = resolve(process.cwd(), "docs/p74-validation-report.md");
  writeFileSync(reportPath, markdown);
  console.log(JSON.stringify(report, null, 2));
  console.error(`Wrote ${reportPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
