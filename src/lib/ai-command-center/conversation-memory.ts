import type {
  CommandCenterAssistantResponse,
  ConversationMemory,
  ConversationTurnMemory,
} from "@/lib/ai-command-center/types";
import { parseMetricsFromEvidence } from "@/lib/ai-command-center/build-follow-up-response";
import type { ExecutiveQueryId } from "@/lib/executive-natural-language-queries/types";

export type FollowUpIntent = "why" | "details" | "who_else" | "automation" | "what_changed";

export function resolveFollowUpIntent(message: string): FollowUpIntent | null {
  const normalized = message.trim().toLowerCase().replace(/[?.,!]/g, "");

  if (/^(why|explain)$/.test(normalized)) return "why";
  if (/^(show me more|more|expand|show me details|details)$/.test(normalized)) return "details";
  if (/^(who else|what else)$/.test(normalized)) return "who_else";
  if (/^can this be automated$/.test(normalized)) return "automation";
  if (/^what changed$/.test(normalized)) return "what_changed";

  return null;
}

export function normalizeConversationMemory(memory: Partial<ConversationMemory> | undefined): ConversationMemory {
  if (memory?.activeTurn) {
    return {
      activeTurn: memory.activeTurn,
      lastQueryId: memory.activeTurn.queryId,
      lastTopic: memory.activeTurn.topic,
      lastSummary: memory.activeTurn.summary,
      lastCandidateIds: memory.activeTurn.candidateIds,
      lastCandidateNames: memory.activeTurn.candidateNames,
      lastSourceEngines: memory.activeTurn.sourceEngines,
      lastRiskLevel: memory.activeTurn.riskLevel,
    };
  }

  if (memory?.lastSummary) {
    const turn: ConversationTurnMemory = {
      queryId: memory.lastQueryId ?? null,
      userMessage: memory.lastTopic ?? "",
      topic: memory.lastTopic ?? "",
      summary: memory.lastSummary,
      evidence: [],
      metrics: {},
      recommendedActions: [],
      sourceEngines: memory.lastSourceEngines ?? [],
      riskLevel: memory.lastRiskLevel ?? "low",
      approvalRequired: false,
      candidateIds: memory.lastCandidateIds ?? [],
      candidateNames: memory.lastCandidateNames ?? [],
    };
    return {
      activeTurn: turn,
      lastQueryId: turn.queryId,
      lastTopic: turn.topic,
      lastSummary: turn.summary,
      lastCandidateIds: turn.candidateIds,
      lastCandidateNames: turn.candidateNames,
      lastSourceEngines: turn.sourceEngines,
      lastRiskLevel: turn.riskLevel,
    };
  }

  return createLegacyEmptyMemory();
}

export function createLegacyEmptyMemory(): ConversationMemory {
  return {
    activeTurn: null,
    lastQueryId: null,
    lastTopic: null,
    lastSummary: null,
    lastCandidateIds: [],
    lastCandidateNames: [],
    lastSourceEngines: [],
    lastRiskLevel: null,
  };
}

export function updateMemoryFromResponse(input: {
  memory: ConversationMemory;
  userMessage: string;
  queryId: ExecutiveQueryId | null;
  topic: string;
  response: CommandCenterAssistantResponse;
}): ConversationMemory {
  const metrics = {
    ...parseMetricsFromEvidence(input.response.supportingEvidence),
    ...(input.response.supportingEvidence.find((line) => line.startsWith("Total: "))
      ? { total: Number(input.response.supportingEvidence.find((line) => line.startsWith("Total: "))?.replace("Total: ", "") || 0) }
      : {}),
  };

  const activeTurn: ConversationTurnMemory = {
    queryId: input.queryId,
    userMessage: input.userMessage,
    topic: input.topic,
    summary: input.response.summary,
    evidence: input.response.supportingEvidence,
    metrics,
    recommendedActions: input.response.recommendedActions,
    sourceEngines: input.response.sourceEngines,
    riskLevel: input.response.riskLevel,
    approvalRequired: input.response.approvalRequired,
    candidateIds: input.response.supportingEvidence
      .filter((line) => line.startsWith("Candidate:") || line.startsWith("Blocked candidate:"))
      .map((line) => line.replace(/^(Candidate|Blocked candidate):/, "").split("—")[0]?.trim() ?? "")
      .filter(Boolean),
    candidateNames: input.response.supportingEvidence
      .filter((line) => line.includes("—") && (line.startsWith("Candidate:") || line.startsWith("Blocked candidate:")))
      .map((line) => line.split("—")[0]?.replace(/^(Candidate|Blocked candidate):/, "").trim() ?? "")
      .filter(Boolean),
  };

  return {
    activeTurn,
    lastQueryId: activeTurn.queryId,
    lastTopic: activeTurn.topic,
    lastSummary: activeTurn.summary,
    lastCandidateIds: activeTurn.candidateIds,
    lastCandidateNames: activeTurn.candidateNames,
    lastSourceEngines: activeTurn.sourceEngines,
    lastRiskLevel: activeTurn.riskLevel,
  };
}

/** Entity-reference follow-ups still route through NL queries (e.g. "that candidate"). */
export function resolveFollowUpMessage(message: string, memory: ConversationMemory): string | null {
  const normalized = message.trim().toLowerCase().replace(/[?.,!]/g, "");
  const turn = memory.activeTurn;

  if (/^(what happens next|what next|next)$/.test(normalized)) {
    return "What should the system do next?";
  }
  if (/^that candidate$/.test(normalized) && turn?.candidateNames[0]) {
    return `Tell me about candidate ${turn.candidateNames[0]}`;
  }
  if (/^those stores$/.test(normalized)) {
    return "Which stores are most at risk?";
  }
  if (/^the previous recommendation$/.test(normalized)) {
    return turn?.topic ? `Explain ${turn.topic}` : "What is the previous recommendation?";
  }

  return null;
}
