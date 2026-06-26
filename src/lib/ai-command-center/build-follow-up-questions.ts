import type { CommandCenterAssistantResponse } from "@/lib/ai-command-center/types";
import type { ExecutiveQueryId } from "@/lib/executive-natural-language-queries/types";

const FOLLOW_UPS_BY_QUERY: Partial<Record<ExecutiveQueryId, string[]>> = {
  decisions_what_next: ["Why?", "Show me details.", "What requires approval?", "Can this be automated?", "What is the safest action?"],
  governance_requires_approval: ["Why?", "Show me details.", "What is safe to approve?", "Can this be automated?", "What rules are stopping automation?"],
  operations_anything_broken: ["Why?", "Show me details.", "Show critical issues", "What needs attention now?", "What changed?"],
  operations_recruiting_slowdown: ["Why?", "Show me details.", "Which candidates are stuck?", "Who else?", "What should leadership fix today?"],
  operations_biggest_risk: ["Why?", "Show me details.", "What happens next?", "Who else?", "What changed?"],
  operations_problem_tomorrow: ["Why?", "Show me details.", "What is broken?", "Can this be automated?", "What changed?"],
  orchestrator_candidates_stuck: ["Why?", "Show me details.", "What should the system do next?", "Who else?", "Can this be automated?"],
  orchestrator_next_actions: ["Why?", "Show me details.", "Who else?", "Can this be automated?", "What requires approval?"],
  brief_how_are_we_doing: ["Why?", "Show me details.", "What changed?", "What needs attention?", "Who else?"],
};

export const DEFAULT_FOLLOW_UPS = [
  "Why?",
  "Show me details.",
  "Who else?",
  "Can this be automated?",
  "What changed?",
];

export function buildFollowUpQuestions(queryId: ExecutiveQueryId | null): string[] {
  const base = queryId ? (FOLLOW_UPS_BY_QUERY[queryId] ?? DEFAULT_FOLLOW_UPS) : DEFAULT_FOLLOW_UPS;
  return [...new Set(base)].slice(0, 5);
}

export function buildFollowUpsFromResponse(response: CommandCenterAssistantResponse): string[] {
  const base = response.followUpQuestions.length >= 3 ? response.followUpQuestions : DEFAULT_FOLLOW_UPS;
  return [...new Set(base)].slice(0, 5);
}
