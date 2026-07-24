import type { BreezyCandidate } from "@/lib/breezy-api";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import {
  evaluatePilotEligibility,
  selectP1932PilotCohort,
} from "@/lib/p193-2-simplified-lifecycle-pilot/selectCohort";
import { runP1932AiReviewPreview } from "@/lib/p193-2-simplified-lifecycle-pilot/aiPreview";
import {
  applyQuestionnaireRecordToCandidate,
} from "@/lib/p193-3-questionnaire-capture/projection";
import type { P1933QuestionnaireRecord } from "@/lib/p193-3-questionnaire-capture/types";

/**
 * Post-backfill eligibility preview — does NOT execute paperwork bridge.
 */
export function runPostBackfillEligibilityPreview(input: {
  candidates: BreezyCandidate[];
  workflows: Record<string, CandidateWorkflowRecord>;
  recordsById: Record<string, P1933QuestionnaireRecord>;
}): {
  applicantsWithQuestionnaire: number;
  remainingMissingQuestionnaire: number;
  clearingHardGates: number;
  aiCounts: { Qualified: number; "Needs Human Review": number; "Not Qualified": number };
  proposedPilotCohortSize: number;
  belowMinimum: boolean;
} {
  const enriched = input.candidates.map((c) =>
    applyQuestionnaireRecordToCandidate(c, input.recordsById[c.candidateId]),
  );

  let applicantsWithQuestionnaire = 0;
  let remainingMissingQuestionnaire = 0;
  let clearingHardGates = 0;
  for (const c of enriched) {
    if (c.hasQuestionnaire || (c.questionnaireAnswers?.length ?? 0) > 0) applicantsWithQuestionnaire += 1;
    else remainingMissingQuestionnaire += 1;
    if (evaluatePilotEligibility({ candidate: c, workflow: input.workflows[c.candidateId] }).ok) {
      clearingHardGates += 1;
    }
  }

  const { cohort, belowMinimum } = selectP1932PilotCohort({
    candidates: enriched,
    workflows: input.workflows,
  });
  const candidatesById = Object.fromEntries(enriched.map((c) => [c.candidateId, c]));
  const ai = runP1932AiReviewPreview({ cohort, candidatesById });

  return {
    applicantsWithQuestionnaire,
    remainingMissingQuestionnaire,
    clearingHardGates,
    aiCounts: ai.counts,
    proposedPilotCohortSize: cohort.members.length,
    belowMinimum,
  };
}
