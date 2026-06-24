import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { applyCandidateProgressions } from "@/lib/candidate-progression-engine/apply-candidate-progressions";
import { buildCandidateProgressionDecisions } from "@/lib/candidate-progression-engine/build-progression-decision";
import type { CandidateWorkflowRecord, RecruiterRosters } from "@/lib/candidate-workflow-types";
import { applyRecruiterActions } from "@/lib/recruiter-action-engine/apply-recruiter-actions";
import { buildRecruiterActionDecisions } from "@/lib/recruiter-action-engine/build-action-decision";
import { applyRecruiterAssignments } from "@/lib/recruiter-assignment-engine/apply-recruiter-assignments";
import { buildRecruiterAssignmentDecisions } from "@/lib/recruiter-assignment-engine/build-assignment-decision";

export async function runPostImportPipeline(input: {
  candidates: BreezyCandidate[];
  workflows: Record<string, CandidateWorkflowRecord>;
  rosters: RecruiterRosters;
  jobsByPositionId: Map<string, BreezyJob>;
  byUserId?: string;
}): Promise<{ assigned: number; actionsGenerated: number; progressionsGenerated: number }> {
  const candidatesById = new Map(input.candidates.map((c) => [c.candidateId, c]));
  const assignmentDecisions = buildRecruiterAssignmentDecisions({
    candidates: input.candidates,
    workflows: input.workflows,
    rosters: input.rosters,
    jobsByPositionId: input.jobsByPositionId,
  });
  const assignedRecords = await applyRecruiterAssignments({
    decisions: assignmentDecisions,
    candidatesById,
    workflows: input.workflows,
    byUserId: input.byUserId,
  });

  const scored = input.candidates.map((candidate) =>
    buildScoredWorkflowRow(candidate, input.workflows[candidate.candidateId], {
      job: input.jobsByPositionId.get(candidate.positionId),
    }),
  );

  const actionDecisions = buildRecruiterActionDecisions(scored);
  const actionRecords = await applyRecruiterActions({
    decisions: actionDecisions,
    workflows: input.workflows,
    byUserId: input.byUserId,
  });

  const progressionDecisions = buildCandidateProgressionDecisions(scored);
  const progressionRecords = await applyCandidateProgressions({
    decisions: progressionDecisions,
    workflows: input.workflows,
    byUserId: input.byUserId,
  });

  return {
    assigned: assignedRecords.length,
    actionsGenerated: actionRecords.length,
    progressionsGenerated: progressionRecords.length,
  };
}
