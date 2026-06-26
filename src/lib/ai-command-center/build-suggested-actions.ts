import type { CommandCenterChatContext } from "@/lib/ai-command-center/build-chat-context";
import type { CommandCenterSuggestedAction, CommandCenterSuggestedPrompt } from "@/lib/ai-command-center/types";

export const COMMAND_CENTER_SUGGESTED_PROMPTS: CommandCenterSuggestedPrompt[] = [
  { id: "hire_today", label: "Who should I hire today?", message: "Who should I hire today?" },
  { id: "approval", label: "What needs approval?", message: "What needs approval?" },
  { id: "broken", label: "What is broken?", message: "What is broken?" },
  { id: "tomorrow", label: "Prepare tomorrow's recruiting plan", message: "Prepare tomorrow's recruiting plan" },
  { id: "risks", label: "Show my biggest risks", message: "Show my biggest risks" },
  { id: "slowdown", label: "Why is recruiting slowing down?", message: "Why is recruiting slowing down?" },
];

export function buildSuggestedActions(context: CommandCenterChatContext): CommandCenterSuggestedAction[] {
  const actions: CommandCenterSuggestedAction[] = [];

  for (const item of context.governance.approvalQueue.slice(0, 3)) {
    actions.push({
      id: `approve-preview-${item.decisionId}`,
      label: `Review: ${item.recommendedAction.slice(0, 48)}`,
      description: `${item.requiredApprover} · preview only`,
      previewOnly: true,
    });
  }

  for (const decision of context.decisions.automationReady.slice(0, 2)) {
    actions.push({
      id: `auto-preview-${decision.decisionId}`,
      label: decision.decision.slice(0, 56),
      description: `${decision.confidence}% confidence · no live execution`,
      previewOnly: true,
    });
  }

  if (context.operations.criticalAlerts[0]) {
    actions.push({
      id: "ops-critical",
      label: "Review critical alert",
      description: context.operations.criticalAlerts[0].recommendedAction,
      previewOnly: true,
    });
  }

  return actions.slice(0, 5);
}
