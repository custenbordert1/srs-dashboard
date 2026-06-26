#!/usr/bin/env npx tsx
/**
 * P77 validation — Autonomous Approval & Governance Engine (preview only).
 */
import { runAutonomousApprovalGovernancePreview } from "@/lib/autonomous-approval-governance";
import { buildP77NlAnswers } from "@/lib/autonomous-approval-governance/build-p77-nl-answers";
import { canExecuteGovernance, loadP77FeatureFlags } from "@/lib/autonomous-approval-governance/feature-flags-store";
import { loadP71FeatureFlags } from "@/lib/autonomous-paperwork-execution-engine/feature-flags-store";
import { loadP73FeatureFlags } from "@/lib/autonomous-candidate-communication-engine/feature-flags-store";
import { loadP74FeatureFlags } from "@/lib/autonomous-recruiting-orchestrator/feature-flags-store";
import { loadP75FeatureFlags } from "@/lib/autonomous-operations-center/feature-flags-store";
import { loadP76FeatureFlags } from "@/lib/autonomous-decision-engine/feature-flags-store";
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
  const [store, workflows, onboardingRecords, policy, p71Flags, p73Flags, p74Flags, p75Flags, p76Flags, storedP77Flags, sendQueueMetrics] =
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
      loadP77FeatureFlags(),
      buildOnboardingSendQueueMetrics(),
    ]);

  const p77Flags = {
    ...storedP77Flags,
    governanceEnabled: true,
    executionMode: "preview" as const,
    previewMode: true,
  };

  const candidates = listIngestedCandidates(store);
  const workflowRows = candidates.map((candidate) =>
    buildScoredWorkflowRow(candidate, workflows[candidate.candidateId]),
  );
  const fetchedAt = store.lastChunkAt ?? store.updatedAt ?? new Date().toISOString();

  const preview = runAutonomousApprovalGovernancePreview({
    candidates,
    workflowRows,
    onboardingRecords,
    policy,
    p71Flags,
    p73Flags: { ...p73Flags, communicationEnabled: true, executionMode: "preview" },
    p74Flags: { ...p74Flags, orchestratorEnabled: true, executionMode: "preview" },
    p75Flags: { ...p75Flags, operationsCenterEnabled: true, executionMode: "preview" },
    p76Flags: { ...p76Flags, decisionEngineEnabled: true, executionMode: "preview" },
    p77Flags,
    sendQueueMetrics,
    fetchedAt,
  });

  const nlAnswer = buildP77NlAnswers({
    queryId: "governance_auto_allowed",
    candidates,
    workflowRows,
    onboardingRecords,
    policy,
    p71Flags,
    p73Flags: { ...p73Flags, communicationEnabled: true, executionMode: "preview" },
    p74Flags: { ...p74Flags, orchestratorEnabled: true, executionMode: "preview" },
    p75Flags: { ...p75Flags, operationsCenterEnabled: true, executionMode: "preview" },
    p76Flags: { ...p76Flags, decisionEngineEnabled: true, executionMode: "preview" },
    p77Flags,
    sendQueueMetrics,
    fetchedAt,
  });

  const { dashboard } = preview;
  const report = {
    validatedAt: new Date().toISOString(),
    phase: "P77",
    previewMode: true,
    durationMs: Date.now() - started,
    candidateCount: workflowRows.length,
    totalReviewed: dashboard.executiveMetrics.totalDecisionsReviewed,
    autoApproved: dashboard.executiveMetrics.autoApproved,
    blockedByPolicy: dashboard.executiveMetrics.blockedByPolicy,
    approvalQueueSize: dashboard.approvalQueue.length,
    pilotEligible: dashboard.executiveMetrics.pilotEligibleActions,
    governanceHealth: dashboard.governanceHealth.status,
    nlQueryExample: {
      queryId: nlAnswer?.queryId,
      summaryPreview: nlAnswer?.summary.slice(0, 280),
    },
    productionWrites: false,
    approvalMutations: false,
    emailsSent: false,
    smsSent: false,
    dropboxSignCalls: false,
    candidateMutations: false,
    automationExecuted: false,
    workflowExecution: false,
    liveGovernanceEnabled: canExecuteGovernance(p77Flags),
    defaultFlags: {
      P77_GOVERNANCE_ENABLED: false,
      P77_EXECUTION_MODE: "preview",
      P77_PREVIEW_MODE: true,
    },
    warnings: preview.warnings,
  };

  const markdown = `# P77 Validation Report

Validated: ${report.validatedAt}

## Preview safeguards

- Production writes: **no**
- Approval mutations: **no**
- Email delivery: **no**
- SMS delivery: **no**
- Dropbox Sign calls: **no**
- Candidate mutations: **no**
- Automation execution: **no**
- Workflow execution: **no**
- Live governance: **${report.liveGovernanceEnabled ? "enabled" : "disabled"}**

## Governance metrics

| Metric | Value |
|--------|------:|
| Decisions reviewed | ${dashboard.executiveMetrics.totalDecisionsReviewed} |
| Auto approved | ${dashboard.executiveMetrics.autoApproved} |
| Blocked by policy | ${dashboard.executiveMetrics.blockedByPolicy} |
| Approval queue | ${dashboard.approvalQueue.length} |
| Pilot eligible | ${dashboard.executiveMetrics.pilotEligibleActions} |
| Governance health | ${dashboard.governanceHealth.status} |

## Natural language example

Query: What can the system do automatically?

\`\`\`
${nlAnswer?.summary ?? "N/A"}
\`\`\`

Duration: ${report.durationMs}ms
`;

  const reportPath = resolve(process.cwd(), "docs/p77-validation-report.md");
  writeFileSync(reportPath, markdown);
  console.log(JSON.stringify(report, null, 2));
  console.error(`Wrote ${reportPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
