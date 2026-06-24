import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { applyCandidateProgressions } from "@/lib/candidate-progression-engine/apply-candidate-progressions";
import { buildCandidateProgressionDecisions } from "@/lib/candidate-progression-engine/build-progression-decision";
import type { CandidateWorkflowRecord, RecruiterRosters } from "@/lib/candidate-workflow-types";
import { filterMtdCandidates } from "@/lib/candidate-ingestion/mtd-candidates";
import { applyRecruiterActions } from "@/lib/recruiter-action-engine/apply-recruiter-actions";
import { buildRecruiterActionDecisions } from "@/lib/recruiter-action-engine/build-action-decision";
import { applyRecruiterAssignments } from "@/lib/recruiter-assignment-engine/apply-recruiter-assignments";
import { buildRecruiterAssignmentDecisions } from "@/lib/recruiter-assignment-engine/build-assignment-decision";

const TERMINAL_STATUSES = new Set(["Not Qualified", "Active Rep", "Loaded in MEL"]);

function scoreCandidates(
  candidates: BreezyCandidate[],
  workflows: Record<string, CandidateWorkflowRecord>,
  jobsByPositionId: Map<string, BreezyJob>,
) {
  return candidates.map((candidate) =>
    buildScoredWorkflowRow(candidate, workflows[candidate.candidateId], {
      job: jobsByPositionId.get(candidate.positionId),
    }),
  );
}

function isAssignedMtdCandidate(
  candidate: BreezyCandidate,
  workflows: Record<string, CandidateWorkflowRecord>,
): boolean {
  const workflow = workflows[candidate.candidateId];
  return Boolean(workflow && !isUnassignedRecruiter(workflow.assignedRecruiter));
}

function isProgressionEligible(
  candidate: BreezyCandidate,
  workflows: Record<string, CandidateWorkflowRecord>,
): boolean {
  const workflow = workflows[candidate.candidateId];
  if (!workflow) return false;
  return !TERMINAL_STATUSES.has(workflow.workflowStatus);
}

export async function runPostImportPipeline(input: {
  candidates: BreezyCandidate[];
  workflows: Record<string, CandidateWorkflowRecord>;
  rosters: RecruiterRosters;
  jobsByPositionId: Map<string, BreezyJob>;
  byUserId?: string;
}): Promise<{ assigned: number; actionsGenerated: number; progressionsGenerated: number }> {
  const mtdCandidates = filterMtdCandidates(input.candidates);
  const candidatesById = new Map(mtdCandidates.map((candidate) => [candidate.candidateId, candidate]));

  const assignmentDecisions = buildRecruiterAssignmentDecisions({
    candidates: mtdCandidates,
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

  const assignedMtd = mtdCandidates.filter((candidate) =>
    isAssignedMtdCandidate(candidate, input.workflows),
  );
  const scoredForActions = scoreCandidates(assignedMtd, input.workflows, input.jobsByPositionId);
  const actionDecisions = buildRecruiterActionDecisions(scoredForActions);
  const actionRecords = await applyRecruiterActions({
    decisions: actionDecisions,
    workflows: input.workflows,
    byUserId: input.byUserId,
  });

  const progressionMtd = mtdCandidates.filter((candidate) =>
    isProgressionEligible(candidate, input.workflows),
  );
  const scoredForProgression = scoreCandidates(progressionMtd, input.workflows, input.jobsByPositionId);
  const progressionDecisions = buildCandidateProgressionDecisions(scoredForProgression);
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
