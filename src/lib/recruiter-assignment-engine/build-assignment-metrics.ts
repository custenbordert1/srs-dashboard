import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import type { CandidateWorkflowState } from "@/lib/candidate-workflow-types";
import type { RecruiterAssignmentDecision, RecruiterAssignmentMetrics } from "@/lib/recruiter-assignment-engine/types";

export function buildRecruiterAssignmentMetrics(input: {
  candidateCount: number;
  workflows: CandidateWorkflowState;
  decisions: RecruiterAssignmentDecision[];
  assigned: number;
}): RecruiterAssignmentMetrics {
  const autoAssigned = Object.values(input.workflows).filter(
    (record) => record.recruiterAssignmentSource === "auto" && !isUnassignedRecruiter(record.assignedRecruiter),
  );
  const manualRequired = Object.values(input.workflows).filter(
    (record) =>
      isUnassignedRecruiter(record.assignedRecruiter) &&
      record.recruiterAssignmentSource !== "manual",
  ).length;

  const unassignedEligible = input.decisions.filter((decision) => decision.shouldAssign).length;
  const confidenceValues = autoAssigned
    .map((record) => record.recruiterAssignmentConfidence ?? 0)
    .filter((value) => value > 0);
  const averageConfidence =
    confidenceValues.length > 0
      ? Math.round(confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length)
      : 0;

  const ownedCount = Object.values(input.workflows).filter(
    (record) => !isUnassignedRecruiter(record.assignedRecruiter),
  ).length;
  const autoAssignmentRate =
    input.candidateCount > 0
      ? Math.round((autoAssigned.length / Math.max(ownedCount, 1)) * 100)
      : 0;

  return {
    autoAssignmentRate,
    manualAssignmentRequired: manualRequired + input.decisions.filter((d) => !d.shouldAssign && d.confidence === 0 && d.reason.includes("Territory")).length,
    averageConfidence,
    totalCandidates: input.candidateCount,
    autoAssignedCount: autoAssigned.length,
    unassignedEligible,
  };
}
