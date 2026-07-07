import {
  P156_FACTOR_LABELS,
  P156_FACTOR_WEIGHTS,
  assertP156WeightsSumTo100,
} from "@/lib/p156-candidate-prioritization/constants";
import type {
  P156FactorBreakdown,
  P156PriorityFactorId,
  P156PriorityLevel,
} from "@/lib/p156-candidate-prioritization/types";
import {
  P156_CRITICAL_THRESHOLD,
  P156_HIGH_THRESHOLD,
  P156_MEDIUM_THRESHOLD,
} from "@/lib/p156-candidate-prioritization/constants";

assertP156WeightsSumTo100();

export function computeWeightedPriorityScore(
  factorSubscores: Record<P156PriorityFactorId, { subscore: number; explanation: string | null }>,
): { priorityScore: number; factorBreakdown: P156FactorBreakdown[] } {
  const factorBreakdown: P156FactorBreakdown[] = [];
  let priorityScore = 0;

  for (const factorId of Object.keys(P156_FACTOR_WEIGHTS) as P156PriorityFactorId[]) {
    const weight = P156_FACTOR_WEIGHTS[factorId];
    const { subscore, explanation } = factorSubscores[factorId];
    const clamped = Math.max(0, Math.min(100, Math.round(subscore)));
    const weightedContribution = (clamped * weight) / 100;
    priorityScore += weightedContribution;
    factorBreakdown.push({
      factorId,
      label: P156_FACTOR_LABELS[factorId],
      subscore: clamped,
      weight,
      weightedContribution: Math.round(weightedContribution * 10) / 10,
      explanation,
    });
  }

  return {
    priorityScore: Math.round(Math.max(0, Math.min(100, priorityScore))),
    factorBreakdown: factorBreakdown.sort((a, b) => b.weightedContribution - a.weightedContribution),
  };
}

export function resolveP156PriorityLevel(score: number): P156PriorityLevel {
  if (score >= P156_CRITICAL_THRESHOLD) return "critical";
  if (score >= P156_HIGH_THRESHOLD) return "high";
  if (score >= P156_MEDIUM_THRESHOLD) return "medium";
  return "low";
}
