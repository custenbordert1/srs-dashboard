import { P157_CONFIDENCE_BASE, P157_HIGH_CONFIDENCE_THRESHOLD } from "@/lib/p157-recruiter-decision-engine/constants";
import type { P157DecisionAction, P157DecisionSignal } from "@/lib/p157-recruiter-decision-engine/types";

export function buildDecisionSignals(signals: string[]): P157DecisionSignal[] {
  return signals.map((label, index) => ({
    id: `signal-${index}`,
    label,
    weight: Math.max(4, 14 - index * 2),
  }));
}

export function computeDecisionConfidence(input: {
  action: P157DecisionAction;
  signals: P157DecisionSignal[];
  priorityScore: number;
  paperworkEligible?: boolean;
  recruiterAssigned?: boolean;
  questionnaireComplete?: boolean;
  noDuplicate?: boolean;
  urgentProject?: boolean;
}): number {
  let score = P157_CONFIDENCE_BASE[input.action];

  const signalBoost = Math.min(12, input.signals.length * 2);
  score += signalBoost;

  if (input.action === "Send Paperwork") {
    if (input.paperworkEligible) score += 5;
    if (input.recruiterAssigned) score += 3;
    if (input.questionnaireComplete) score += 3;
    if (input.noDuplicate) score += 2;
    if (input.urgentProject) score += 2;
  }

  if (input.action === "Assign Recruiter" && input.urgentProject) {
    score += 4;
  }

  if (input.action === "Manual Review") {
    score = Math.min(score, 72);
  }

  if (input.priorityScore >= 75) score += 2;
  if (input.priorityScore >= 85) score += 2;

  return Math.max(0, Math.min(100, Math.round(score)));
}

export function isHighConfidenceDecision(confidence: number): boolean {
  return confidence >= P157_HIGH_CONFIDENCE_THRESHOLD;
}
