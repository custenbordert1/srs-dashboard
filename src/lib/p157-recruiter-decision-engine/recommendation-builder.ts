import type { P157CandidateDecision } from "@/lib/p157-recruiter-decision-engine/types";
import { P157_ACTION_LABELS } from "@/lib/p157-recruiter-decision-engine/constants";

export function buildP157RecommendationSummary(decision: P157CandidateDecision): string {
  return `${P157_ACTION_LABELS[decision.action]} (${decision.confidence}% confidence)`;
}

export function sortDecisionsByPriority(
  decisions: P157CandidateDecision[],
): P157CandidateDecision[] {
  return [...decisions].sort(
    (a, b) =>
      b.priorityScore - a.priorityScore ||
      b.confidence - a.confidence ||
      a.candidateId.localeCompare(b.candidateId),
  );
}
