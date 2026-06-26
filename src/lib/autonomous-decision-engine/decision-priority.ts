import type { DecisionPriority, DecisionRisk } from "@/lib/autonomous-decision-engine/types";

const PRIORITY_RANK: Record<DecisionPriority, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

const RISK_RANK: Record<DecisionRisk, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export function compareDecisionPriority(a: DecisionPriority, b: DecisionPriority): number {
  return PRIORITY_RANK[b] - PRIORITY_RANK[a];
}

export function riskToNumeric(risk: DecisionRisk): number {
  return RISK_RANK[risk];
}

export function derivePriority(input: {
  severity?: "low" | "medium" | "high" | "critical";
  automationReady: boolean;
  blocked: boolean;
  confidence: number;
}): DecisionPriority {
  if (input.blocked) return input.severity === "critical" ? "critical" : "medium";
  if (input.severity === "critical") return "critical";
  if (input.severity === "high") return "high";
  if (input.automationReady && input.confidence >= 85) return "high";
  if (input.confidence >= 70) return "medium";
  return "low";
}

export function sortDecisionsByValue<T extends { priority: DecisionPriority; confidence: number; estimatedRecruiterTimeSavedMinutes: number; blocked: boolean }>(
  decisions: T[],
): T[] {
  return [...decisions].sort((a, b) => {
    if (a.blocked !== b.blocked) return a.blocked ? 1 : -1;
    const priorityDiff = compareDecisionPriority(a.priority, b.priority);
    if (priorityDiff !== 0) return priorityDiff;
    const valueDiff = b.estimatedRecruiterTimeSavedMinutes - a.estimatedRecruiterTimeSavedMinutes;
    if (valueDiff !== 0) return valueDiff;
    return b.confidence - a.confidence;
  });
}
