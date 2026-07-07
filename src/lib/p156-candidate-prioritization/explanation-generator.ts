import { P156_EXPLANATION_MIN_CONTRIBUTION } from "@/lib/p156-candidate-prioritization/constants";
import type { P156FactorBreakdown } from "@/lib/p156-candidate-prioritization/types";

export function buildPriorityExplanation(input: {
  priorityScore: number;
  factorBreakdown: P156FactorBreakdown[];
  maxReasons?: number;
}): string[] {
  const maxReasons = input.maxReasons ?? 6;
  const reasons: string[] = [];

  for (const factor of input.factorBreakdown) {
    if (!factor.explanation) continue;
    if (factor.weightedContribution < P156_EXPLANATION_MIN_CONTRIBUTION) continue;
    if (!reasons.includes(factor.explanation)) {
      reasons.push(factor.explanation);
    }
    if (reasons.length >= maxReasons) break;
  }

  if (reasons.length === 0) {
    const top = input.factorBreakdown.find((f) => f.subscore >= 60);
    if (top?.label) {
      reasons.push(`Elevated ${top.label.toLowerCase()}`);
    } else {
      reasons.push("Standard queue priority");
    }
  }

  return reasons;
}

export function formatPriorityExplanationBlock(input: {
  priorityScore: number;
  reasoning: string[];
}): string {
  const lines = [`Priority: ${input.priorityScore}`, "", "Reasons:"];
  for (const reason of input.reasoning) {
    lines.push(`• ${reason}`);
  }
  return lines.join("\n");
}
