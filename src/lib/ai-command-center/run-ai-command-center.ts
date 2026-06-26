import { randomUUID } from "node:crypto";
import type { BreezyCandidate } from "@/lib/breezy-api";
import type { CandidateOnboardingRecord, CandidateOnboardingPolicy } from "@/lib/candidate-onboarding-engine/types";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { OnboardingSendQueueMetrics } from "@/lib/candidate-onboarding-send-queue/types";
import {
  buildAiCommandResponse,
  createAssistantMessage,
  createUserMessage,
  resolveCommandCenterQuery,
} from "@/lib/ai-command-center/build-ai-command-response";
import { buildExecutiveGreeting } from "@/lib/ai-command-center/build-executive-greeting";
import { buildCommandCenterChatContext } from "@/lib/ai-command-center/build-chat-context";
import { COMMAND_CENTER_SUGGESTED_PROMPTS } from "@/lib/ai-command-center/build-suggested-actions";
import { appendMessage, loadChatSession, saveChatSession } from "@/lib/ai-command-center/chat-history";
import { createCommandCenterSession } from "@/lib/ai-command-center/conversation-state";
import { resolveFollowUpMessage, updateMemoryFromResponse } from "@/lib/ai-command-center/conversation-memory";
import {
  canExecuteCommandCenter,
  isPreviewCommandCenter,
} from "@/lib/ai-command-center/feature-flags-store";
import type {
  CommandCenterChatResult,
  CommandCenterDashboardSnapshot,
  CommandCenterExecutiveMetrics,
  P78FeatureFlags,
} from "@/lib/ai-command-center/types";
import { P78_PREVIEW_MODE, P78_SOURCE_PHASE } from "@/lib/ai-command-center/types";
import type { P71FeatureFlags } from "@/lib/autonomous-paperwork-execution-engine/types";
import type { P73FeatureFlags } from "@/lib/autonomous-candidate-communication-engine/types";
import type { P74FeatureFlags } from "@/lib/autonomous-recruiting-orchestrator/types";
import type { P75FeatureFlags } from "@/lib/autonomous-operations-center/types";
import type { P76FeatureFlags } from "@/lib/autonomous-decision-engine/types";
import type { P77FeatureFlags } from "@/lib/autonomous-approval-governance/types";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import type { ActiveRep } from "@/lib/rep-intelligence/rep-types";
import { runExecutiveQueryPreview } from "@/lib/executive-natural-language-queries/run-executive-query-preview";

function buildControls(flags: P78FeatureFlags) {
  return {
    commandCenterEnabled: flags.commandCenterEnabled,
    executionMode: flags.executionMode,
    previewMode: flags.previewMode,
    canExecute: canExecuteCommandCenter(flags),
    previewOnly: isPreviewCommandCenter(flags),
  };
}

function updateMetrics(
  metrics: CommandCenterExecutiveMetrics,
  responseTimeMs: number,
  context: ReturnType<typeof buildCommandCenterChatContext>,
): CommandCenterExecutiveMetrics {
  const questionsAsked = metrics.questionsAsked + 1;
  const prevTotal = metrics.averageResponseTimeMs != null ? metrics.averageResponseTimeMs * metrics.questionsAsked : 0;
  const previewActions =
    context.governance.approvalQueue.length + context.decisions.automationReady.length;
  return {
    questionsAsked,
    recommendationsGenerated: metrics.recommendationsGenerated + 1,
    previewActions,
    estimatedRecruiterHoursSaved: context.decisions.executiveMetrics.recruiterHoursSaved,
    decisionConfidence: context.decisions.executiveMetrics.averageConfidence,
    averageResponseTimeMs: Math.round((prevTotal + responseTimeMs) / questionsAsked),
  };
}

export function buildCommandCenterDashboard(input: {
  candidates: BreezyCandidate[];
  workflowRows: ScoredCandidateWorkflowRow[];
  onboardingRecords: CandidateOnboardingRecord[];
  policy: CandidateOnboardingPolicy;
  p71Flags: P71FeatureFlags;
  p73Flags: P73FeatureFlags;
  p74Flags: P74FeatureFlags;
  p75Flags: P75FeatureFlags;
  p76Flags: P76FeatureFlags;
  p77Flags: P77FeatureFlags;
  p78Flags: P78FeatureFlags;
  sendQueueMetrics: OnboardingSendQueueMetrics | null;
  opportunities?: MelOpportunity[];
  activeReps?: ActiveRep[];
  sessionId?: string;
  fetchedAt?: string;
  executiveFirstName?: string;
}): CommandCenterDashboardSnapshot {
  const fetchedAt = input.fetchedAt ?? new Date().toISOString();
  const context = buildCommandCenterChatContext({ ...input, fetchedAt });
  const sessionId = input.sessionId ?? randomUUID();
  const executiveGreeting = buildExecutiveGreeting(context, input.executiveFirstName);

  const warnings = [
    "Preview mode — AI Command Center explains and recommends only, governed by P77.",
    "No production writes, approval execution, emails, SMS, Dropbox Sign, or workflow changes.",
  ];

  if (!input.p78Flags.commandCenterEnabled) {
    warnings.push("Command center is OFF — chat computed for preview only.");
  }

  return {
    sourcePhase: P78_SOURCE_PHASE,
    previewMode: P78_PREVIEW_MODE,
    fetchedAt,
    controls: buildControls(input.p78Flags),
    greeting: executiveGreeting.formattedText,
    executiveGreeting,
    platformHealth: {
      score: context.operations.platformHealth.overall,
      status: context.operations.systemHealth.status,
      summary: context.operations.systemHealth.summary,
    },
    suggestedPrompts: COMMAND_CENTER_SUGGESTED_PROMPTS,
    sessionId,
    metrics: createCommandCenterSession(sessionId).metrics,
    warnings,
  };
}

export async function processCommandCenterChat(input: {
  message: string;
  sessionId: string;
  candidates: BreezyCandidate[];
  workflowRows: ScoredCandidateWorkflowRow[];
  onboardingRecords: CandidateOnboardingRecord[];
  policy: CandidateOnboardingPolicy;
  p71Flags: P71FeatureFlags;
  p73Flags: P73FeatureFlags;
  p74Flags: P74FeatureFlags;
  p75Flags: P75FeatureFlags;
  p76Flags: P76FeatureFlags;
  p77Flags: P77FeatureFlags;
  p78Flags: P78FeatureFlags;
  sendQueueMetrics: OnboardingSendQueueMetrics | null;
  opportunities?: MelOpportunity[];
  activeReps?: ActiveRep[];
  fetchedAt?: string;
}): Promise<CommandCenterChatResult> {
  const started = performance.now();
  const fetchedAt = input.fetchedAt ?? new Date().toISOString();
  const session = await loadChatSession(input.sessionId);
  const userText = input.message.trim();

  const followUp = resolveFollowUpMessage(userText, session.memory);
  const effectiveMessage = followUp ?? userText;
  const queryId = resolveCommandCenterQuery(effectiveMessage);

  const context = buildCommandCenterChatContext({ ...input, fetchedAt });

  const nlResult = await runExecutiveQueryPreview({
    candidates: input.candidates,
    workflowRows: input.workflowRows,
    onboardingRecords: input.onboardingRecords,
    policy: input.policy,
    flags: input.p71Flags,
    p73Flags: input.p73Flags,
    p74Flags: input.p74Flags,
    p75Flags: input.p75Flags,
    p76Flags: input.p76Flags,
    p77Flags: input.p77Flags,
    sendQueueMetrics: input.sendQueueMetrics,
    opportunities: input.opportunities,
    activeReps: input.activeReps,
    question: effectiveMessage,
    forcedQueryId: queryId,
    fetchedAt,
  });

  const assistantPayload = buildAiCommandResponse({
    message: effectiveMessage,
    context,
    answer: nlResult.answer,
    queryId,
  });

  const assistantMsg = createAssistantMessage(assistantPayload);
  const userMsg = createUserMessage(userText);

  const responseTimeMs = Math.round(performance.now() - started);
  const metrics = updateMetrics(session.metrics, responseTimeMs, context);
  const memory = updateMemoryFromResponse({
    memory: session.memory,
    queryId,
    topic: nlResult.answer?.question ?? effectiveMessage,
    summary: assistantPayload.summary,
    response: assistantPayload,
  });

  let updated = appendMessage(session, userMsg);
  updated = appendMessage(updated, assistantMsg);
  updated = { ...updated, memory, metrics };

  await saveChatSession(updated);

  return {
    ok: true,
    previewMode: P78_PREVIEW_MODE,
    sessionId: updated.sessionId,
    message: assistantMsg,
    metrics,
    warnings: [
      "Preview only — no live actions executed.",
      ...nlResult.warnings.slice(0, 2),
    ],
  };
}
