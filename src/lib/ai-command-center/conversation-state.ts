import { randomUUID } from "node:crypto";
import type { CommandCenterExecutiveMetrics, CommandCenterSession, ConversationMemory } from "@/lib/ai-command-center/types";

export function createEmptyMemory(): ConversationMemory {
  return {
    lastQueryId: null,
    lastTopic: null,
    lastSummary: null,
    lastCandidateIds: [],
    lastCandidateNames: [],
    lastSourceEngines: [],
    lastRiskLevel: null,
  };
}

export function createEmptyMetrics(): CommandCenterExecutiveMetrics {
  return {
    questionsAsked: 0,
    recommendationsGenerated: 0,
    previewActions: 0,
    estimatedRecruiterHoursSaved: 0,
    decisionConfidence: null,
    averageResponseTimeMs: null,
  };
}

export function createCommandCenterSession(sessionId?: string): CommandCenterSession {
  const now = new Date().toISOString();
  return {
    sessionId: sessionId ?? randomUUID(),
    createdAt: now,
    updatedAt: now,
    memory: createEmptyMemory(),
    messages: [],
    metrics: createEmptyMetrics(),
  };
}

export function touchSession(session: CommandCenterSession): CommandCenterSession {
  return { ...session, updatedAt: new Date().toISOString() };
}
