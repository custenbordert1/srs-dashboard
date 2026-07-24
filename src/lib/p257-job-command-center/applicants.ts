import type { BreezyCandidate } from "@/lib/breezy-api";
import { buildBaselineWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type {
  CandidateWorkflowRecord,
  CandidateWorkflowState,
} from "@/lib/candidate-workflow-types";
import { filterApplicantsForBreezyJob } from "@/lib/p257-job-command-center/filter-applicants";
import type { JobCommandCenterApplicantInput } from "@/lib/p257-job-command-center/types";

export function toJobCommandCenterApplicantInput(
  candidate: BreezyCandidate,
  workflow?: CandidateWorkflowRecord,
): JobCommandCenterApplicantInput {
  const row = buildBaselineWorkflowRow(candidate, workflow);
  return {
    candidateId: row.candidateId,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    positionId: row.positionId,
    positionName: row.positionName,
    city: row.city,
    state: row.state,
    zipCode: row.zipCode,
    stage: row.stage,
    appliedDate: row.appliedDate,
    updatedDate: row.updatedDate,
    workflowStatus: row.workflowStatus,
    distanceMiles: row.distanceMiles,
    history: row.history,
    lastActionAt: row.lastActionAt,
    paperworkSentAt: row.paperworkSentAt,
    paperworkSignedAt: row.paperworkSignedAt,
  };
}

/** Filter + enrich candidates for a Breezy job into panel applicant inputs. */
export function buildApplicantsForJobCommandCenter(input: {
  breezyJobId: string;
  jobTitle?: string;
  candidates: BreezyCandidate[];
  workflows?: CandidateWorkflowState;
}): JobCommandCenterApplicantInput[] {
  const matched = filterApplicantsForBreezyJob(input.candidates, {
    jobId: input.breezyJobId,
    name: input.jobTitle,
  });
  return matched.map((candidate) =>
    toJobCommandCenterApplicantInput(candidate, input.workflows?.[candidate.candidateId]),
  );
}
