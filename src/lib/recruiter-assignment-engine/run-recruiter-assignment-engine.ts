import type { BreezyCandidate } from "@/lib/breezy-api";
import { applyRecruiterAssignments } from "@/lib/recruiter-assignment-engine/apply-recruiter-assignments";
import { buildRecruiterAssignmentDecisions } from "@/lib/recruiter-assignment-engine/build-assignment-decision";
import { buildRecruiterAssignmentMetrics } from "@/lib/recruiter-assignment-engine/build-assignment-metrics";
import type {
  RecruiterAssignmentEngineInput,
  RecruiterAssignmentEngineResult,
} from "@/lib/recruiter-assignment-engine/types";

export async function runRecruiterAssignmentEngine(
  input: RecruiterAssignmentEngineInput & { byUserId?: string; persist?: boolean },
): Promise<RecruiterAssignmentEngineResult> {
  const decisions = buildRecruiterAssignmentDecisions({
    candidates: input.candidates,
    workflows: input.workflows,
    rosters: input.rosters,
    jobsByPositionId: input.jobsByPositionId,
  });

  let assigned = 0;
  if (input.persist !== false) {
    const candidatesById = new Map(input.candidates.map((candidate) => [candidate.candidateId, candidate]));
    const workflows = { ...input.workflows };
    const records = await applyRecruiterAssignments({
      decisions,
      candidatesById,
      workflows,
      byUserId: input.byUserId,
    });
    assigned = records.length;
    Object.assign(input.workflows, workflows);
  } else {
    assigned = decisions.filter((decision) => decision.shouldAssign).length;
  }

  const skipped = decisions.length - assigned;
  const metrics = buildRecruiterAssignmentMetrics({
    candidateCount: input.candidates.length,
    workflows: input.workflows,
    decisions,
    assigned,
  });

  return { decisions, assigned, skipped, metrics };
}
