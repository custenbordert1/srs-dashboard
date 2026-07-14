import { P188_1_RECOMMENDED_STAGE } from "@/lib/p188-1-hiring-recommendation-workflow/types";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import type {
  P189ExecutionResult,
  P189FrozenCohort,
} from "@/lib/p189-recommend-hire-pilot/types";

export type P189ValidationReport = {
  recommendationsWritten: number;
  auditEventsWritten: number;
  p186ObservedEvents: number;
  duplicateRecommendations: number;
  staleConflicts: number;
  failedWrites: number;
  lifecycleIntegrityOk: boolean;
  paperworkCreated: number;
  approvalsCreated: number;
  recruiterOwnershipPreserved: number;
  recruiterOwnershipDrift: number;
  details: string[];
};

/**
 * Post-execution validation against live workflow state.
 */
export function validateP189Execution(input: {
  cohort: P189FrozenCohort;
  result: P189ExecutionResult;
  workflowsById: Map<string, CandidateWorkflowRecord>;
}): P189ValidationReport {
  const details: string[] = [];
  let recommendationsWritten = 0;
  let recruiterOwnershipPreserved = 0;
  let recruiterOwnershipDrift = 0;
  let paperworkCreated = 0;
  let approvalsCreated = 0;

  for (const member of input.cohort.members) {
    const attempt = input.result.attempts.find((a) => a.candidateId === member.candidateId);
    if (!attempt?.ok) continue;
    const wf = input.workflowsById.get(member.candidateId);
    if (!wf) {
      details.push(`missing workflow after success: ${member.candidateId}`);
      continue;
    }
    if (wf.recommendedStage === P188_1_RECOMMENDED_STAGE) {
      recommendationsWritten += 1;
    } else {
      details.push(`recommendedStage missing for ${member.candidateId}`);
    }
    if (wf.assignedRecruiter === member.recruiter) {
      recruiterOwnershipPreserved += 1;
    } else {
      recruiterOwnershipDrift += 1;
      details.push(
        `recruiter drift ${member.candidateId}: expected ${member.recruiter} got ${wf.assignedRecruiter}`,
      );
    }
    if (
      (wf.workflowStatus === "Paperwork Needed" ||
        wf.workflowStatus === "Paperwork Sent" ||
        (wf.paperworkStatus && wf.paperworkStatus !== "not_sent")) &&
      !String(member.currentStage).includes("Paperwork")
    ) {
      paperworkCreated += 1;
    }
    if (/operator.?approv/i.test(wf.progressionReason ?? "")) {
      approvalsCreated += 1;
    }
  }

  const lifecycleIntegrityOk =
    recruiterOwnershipDrift === 0 &&
    paperworkCreated === 0 &&
    approvalsCreated === 0 &&
    input.result.paperworkSendsAttempted === 0 &&
    input.result.operatorApprovalsAttempted === 0 &&
    input.result.melWritesAttempted === 0;

  return {
    recommendationsWritten,
    auditEventsWritten: input.result.auditEvents,
    p186ObservedEvents: input.result.p186Observations,
    duplicateRecommendations: input.result.duplicateRecommendations,
    staleConflicts: input.result.staleConflicts,
    failedWrites: input.result.failed,
    lifecycleIntegrityOk,
    paperworkCreated,
    approvalsCreated,
    recruiterOwnershipPreserved,
    recruiterOwnershipDrift,
    details,
  };
}
