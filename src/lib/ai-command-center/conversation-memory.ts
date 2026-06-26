import type {
  CommandCenterAssistantResponse,
  ConversationMemory,
} from "@/lib/ai-command-center/types";
import type { ExecutiveQueryId } from "@/lib/executive-natural-language-queries/types";

export function updateMemoryFromResponse(input: {
  memory: ConversationMemory;
  queryId: ExecutiveQueryId | null;
  topic: string;
  summary: string;
  response: CommandCenterAssistantResponse;
}): ConversationMemory {
  return {
    lastQueryId: input.queryId,
    lastTopic: input.topic,
    lastSummary: input.summary,
    lastCandidateIds: input.response.supportingEvidence
      .filter((line) => line.startsWith("Candidate:"))
      .map((line) => line.replace("Candidate:", "").trim())
      .filter(Boolean),
    lastCandidateNames: input.response.supportingEvidence
      .filter((line) => line.includes("—"))
      .map((line) => line.split("—")[0]?.replace("Candidate:", "").trim() ?? "")
      .filter(Boolean),
    lastSourceEngines: input.response.sourceEngines,
    lastRiskLevel: input.response.riskLevel,
  };
}

export function resolveFollowUpMessage(message: string, memory: ConversationMemory): string | null {
  const normalized = message.trim().toLowerCase().replace(/[?.,!]/g, "");

  if (/^(why|explain)$/.test(normalized) && memory.lastSummary) {
    return memory.lastTopic ? `Why ${memory.lastTopic}?` : "Why did the AI recommend this?";
  }
  if (/^(show me more|more|expand|show me details|details)$/.test(normalized) && memory.lastQueryId) {
    return expandQueryForMore(memory.lastQueryId);
  }
  if (/^(who else|what else)$/.test(normalized)) {
    return "What needs attention now?";
  }
  if (/^(what changed|what changed\?)$/.test(normalized)) {
    return "What changed since yesterday?";
  }
  if (/^(what happens next|what next|next)$/.test(normalized)) {
    return "What should the system do next?";
  }
  if (/^that candidate$/.test(normalized) && memory.lastCandidateNames[0]) {
    return `Tell me about candidate ${memory.lastCandidateNames[0]}`;
  }
  if (/^those stores$/.test(normalized)) {
    return "Which stores are most at risk?";
  }
  if (/^the previous recommendation$/.test(normalized)) {
    return memory.lastTopic ? `Explain ${memory.lastTopic}` : "What is the previous recommendation?";
  }

  return null;
}

function expandQueryForMore(queryId: ExecutiveQueryId): string {
  switch (queryId) {
    case "operations_critical_issues":
      return "Show critical issues";
    case "governance_requires_approval":
      return "Which decisions need approval?";
    case "decisions_what_next":
      return "What high-confidence actions exist?";
    case "orchestrator_candidates_stuck":
      return "Which candidates are stuck?";
    default:
      return "What needs attention now?";
  }
}
