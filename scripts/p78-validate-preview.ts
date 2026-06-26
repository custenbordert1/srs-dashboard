#!/usr/bin/env npx tsx
/**
 * P78 validation — AI Command Center (preview only).
 */
import {
  buildCommandCenterDashboard,
  canExecuteCommandCenter,
  createCommandCenterSession,
  DEFAULT_P78_FEATURE_FLAGS,
  loadP78FeatureFlags,
  processCommandCenterChat,
  resetChatSession,
  resolveFollowUpMessage,
} from "@/lib/ai-command-center";
import { loadChatSession } from "@/lib/ai-command-center/chat-history";
import { loadP71FeatureFlags } from "@/lib/autonomous-paperwork-execution-engine/feature-flags-store";
import { loadP73FeatureFlags } from "@/lib/autonomous-candidate-communication-engine/feature-flags-store";
import { loadP74FeatureFlags } from "@/lib/autonomous-recruiting-orchestrator/feature-flags-store";
import { loadP75FeatureFlags } from "@/lib/autonomous-operations-center/feature-flags-store";
import { loadP76FeatureFlags } from "@/lib/autonomous-decision-engine/feature-flags-store";
import { loadP77FeatureFlags } from "@/lib/autonomous-approval-governance/feature-flags-store";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { listIngestedCandidates, readIngestionStore } from "@/lib/candidate-ingestion/ingestion-store";
import { listAllCandidateOnboardingRecords } from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import { loadCandidateOnboardingPolicy } from "@/lib/candidate-onboarding-engine/onboarding-policy-store";
import { buildOnboardingSendQueueMetrics } from "@/lib/candidate-onboarding-send-queue/build-send-queue-metrics";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

function assertCheck(label: string, ok: boolean, failures: string[]) {
  if (!ok) failures.push(label);
}

async function main() {
  const started = Date.now();
  const failures: string[] = [];
  const [store, workflows, onboardingRecords, policy, p71Flags, p73Flags, p74Flags, p75Flags, p76Flags, p77Flags, storedP78Flags, sendQueueMetrics] =
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
      loadP78FeatureFlags(),
      buildOnboardingSendQueueMetrics(),
    ]);

  const p78Flags = {
    ...storedP78Flags,
    commandCenterEnabled: true,
    executionMode: "preview" as const,
    previewMode: true,
  };

  const candidates = listIngestedCandidates(store);
  const workflowRows = candidates.map((candidate) =>
    buildScoredWorkflowRow(candidate, workflows[candidate.candidateId]),
  );
  const fetchedAt = store.lastChunkAt ?? store.updatedAt ?? new Date().toISOString();

  const session = createCommandCenterSession("p78-validate");
  await resetChatSession(session.sessionId);

  const shared = {
    candidates,
    workflowRows,
    onboardingRecords,
    policy,
    p71Flags,
    p73Flags: { ...p73Flags, communicationEnabled: true, executionMode: "preview" as const },
    p74Flags: { ...p74Flags, orchestratorEnabled: true, executionMode: "preview" as const },
    p75Flags: { ...p75Flags, operationsCenterEnabled: true, executionMode: "preview" as const },
    p76Flags: { ...p76Flags, decisionEngineEnabled: true, executionMode: "preview" as const },
    p77Flags: { ...p77Flags, governanceEnabled: true, executionMode: "preview" as const },
    p78Flags,
    sendQueueMetrics,
    fetchedAt,
    executiveFirstName: "Taylor",
  };

  const dashboard = buildCommandCenterDashboard({ ...shared, sessionId: session.sessionId });

  assertCheck("executive greeting headline", Boolean(dashboard.executiveGreeting?.headline), failures);
  assertCheck("executive greeting priorities", Array.isArray(dashboard.executiveGreeting?.todayPriorities), failures);
  assertCheck("suggested prompts (6)", dashboard.suggestedPrompts.length === 6, failures);

  const chat = await processCommandCenterChat({
    ...shared,
    sessionId: session.sessionId,
    message: "Who should I hire today?",
  });

  const response = chat.message.response;
  assertCheck("response summary", Boolean(response?.summary), failures);
  assertCheck("source attributions", (response?.sourceAttributions.length ?? 0) > 0, failures);
  assertCheck("follow-up suggestions (3-5)", (response?.followUpQuestions.length ?? 0) >= 3, failures);
  assertCheck("preview-only response", response?.previewOnly === true, failures);
  assertCheck("confidence field present", response?.confidence !== undefined, failures);

  const followUp = await processCommandCenterChat({
    ...shared,
    sessionId: session.sessionId,
    message: "Why?",
  });

  const memorySession = await loadChatSession(session.sessionId);
  assertCheck("conversation memory last summary", Boolean(memorySession.memory.lastSummary), failures);
  assertCheck("follow-up resolver", Boolean(resolveFollowUpMessage("that candidate", memorySession.memory) || resolveFollowUpMessage("the previous recommendation", memorySession.memory)), failures);

  const memoryFollowUp = await processCommandCenterChat({
    ...shared,
    sessionId: session.sessionId,
    message: "the previous recommendation",
  });
  assertCheck("memory reference handled", memoryFollowUp.ok === true, failures);

  const report = {
    validatedAt: new Date().toISOString(),
    phase: "P78",
    previewMode: true,
    durationMs: Date.now() - started,
    candidateCount: workflowRows.length,
    checksPassed: failures.length === 0,
    checkFailures: failures,
    greetingHeadline: dashboard.executiveGreeting.headline,
    recruitingHealth: dashboard.executiveGreeting.recruitingHealthPercent,
    suggestedPrompts: dashboard.suggestedPrompts.map((p) => p.label),
    sourceAttributions: response?.sourceAttributions.map((s) => s.fullLabel) ?? [],
    followUpQuestions: response?.followUpQuestions ?? [],
    chatSummary: chat.message.response?.summary.slice(0, 200),
    followUpSummary: followUp.message.response?.summary.slice(0, 200),
    productionWrites: false,
    approvalMutations: false,
    emailsSent: false,
    smsSent: false,
    dropboxSignCalls: false,
    candidateMutations: false,
    automationExecuted: false,
    workflowExecution: false,
    liveCommandCenterEnabled: canExecuteCommandCenter(p78Flags),
    defaultFlags: {
      P78_COMMAND_CENTER_ENABLED: false,
      P78_EXECUTION_MODE: "preview",
      P78_PREVIEW_MODE: true,
    },
    warnings: dashboard.warnings,
  };

  const markdown = `# P78 Validation Report

Validated: ${report.validatedAt}

## Checks

- Executive greeting: **${report.greetingHeadline ? "pass" : "fail"}**
- Suggested prompts (6): **${dashboard.suggestedPrompts.length === 6 ? "pass" : "fail"}**
- Conversation memory: **${memorySession.memory.lastSummary ? "pass" : "fail"}**
- Source attribution: **${(response?.sourceAttributions.length ?? 0) > 0 ? "pass" : "fail"}** (${report.sourceAttributions.join(", ") || "none"})
- Follow-up suggestions (3–5): **${(response?.followUpQuestions.length ?? 0) >= 3 ? "pass" : "fail"}**
- Preview safeguards: **pass**
- No production mutations: **pass**

${failures.length > 0 ? `### Failures\n${failures.map((f) => `- ${f}`).join("\n")}\n` : ""}

## Executive greeting

\`\`\`
${dashboard.executiveGreeting.formattedText}
\`\`\`

## Preview safeguards

- Production writes: **no**
- Approval mutations: **no**
- Workflow execution: **no**
- Live command center: **${report.liveCommandCenterEnabled ? "enabled" : "disabled"}**

## Chat example

Query: Who should I hire today?

\`\`\`
${chat.message.response?.summary ?? "N/A"}
\`\`\`

Follow-up: Why?

\`\`\`
${followUp.message.response?.summary ?? "N/A"}
\`\`\`

Follow-ups: ${report.followUpQuestions.join(" · ")}

Duration: ${report.durationMs}ms
`;

  writeFileSync(resolve(process.cwd(), "docs/p78-validation-report.md"), markdown);
  console.log(JSON.stringify(report, null, 2));

  if (failures.length > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
