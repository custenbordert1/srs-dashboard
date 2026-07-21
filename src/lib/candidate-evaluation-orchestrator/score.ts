import type { BreezyCandidate } from "@/lib/breezy-api";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import {
  buildEmailDuplicateIndex,
  evaluateP204Qualification,
} from "@/lib/p204-ai-candidate-qualification/decide";
import type { CandidateEvaluation, ScoringRubric } from "@/lib/candidate-evaluation-orchestrator/types";
import { ADVANCEMENT_SCORE_WEIGHTS } from "@/lib/recruiting/candidate-advancement-engine";

export function getSharedScoringRubric(): ScoringRubric {
  return {
    rubricId: "advancement-score-weights-v1",
    weights: ADVANCEMENT_SCORE_WEIGHTS,
    thresholdSource: "p204-blend + p193.4 qualified-90-nhro-70",
  };
}

/**
 * Primary score path — wraps existing P204 (P193 + P193.4 + readiness).
 */
export function scoreCandidateRow(input: {
  row: ScoredCandidateWorkflowRow;
  emailCounts?: Map<string, number>;
  allCandidatesForDupIndex?: BreezyCandidate[];
}): CandidateEvaluation {
  const emailCounts =
    input.emailCounts ??
    (input.allCandidatesForDupIndex
      ? buildEmailDuplicateIndex(input.allCandidatesForDupIndex)
      : new Map<string, number>());
  return evaluateP204Qualification({ row: input.row, emailCounts });
}

export { buildEmailDuplicateIndex };
