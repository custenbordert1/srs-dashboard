import type { P157DecisionAction } from "@/lib/p157-recruiter-decision-engine/types";

export function buildDecisionReasoning(input: {
  action: P157DecisionAction;
  signals: string[];
  maxReasons?: number;
}): string[] {
  const maxReasons = input.maxReasons ?? 6;
  const reasons: string[] = [];

  for (const signal of input.signals) {
    const normalized = signal.trim().toLowerCase();
    if (!normalized) continue;
    const formatted = normalized.endsWith(".") ? normalized.slice(0, -1) : normalized;
    if (!reasons.includes(formatted)) {
      reasons.push(formatted);
    }
    if (reasons.length >= maxReasons) break;
  }

  if (reasons.length === 0) {
    reasons.push(`Recommended action: ${input.action.toLowerCase()}`);
  }

  return reasons;
}

export function formatDecisionExplanationBlock(input: {
  action: P157DecisionAction;
  confidence: number;
  reasoning: string[];
}): string {
  const lines = [
    `Recommended:`,
    input.action,
    "",
    "Confidence:",
    String(input.confidence),
    "",
    "Reasons:",
  ];
  for (const reason of input.reasoning) {
    lines.push(`- ${reason}`);
  }
  return lines.join("\n");
}
