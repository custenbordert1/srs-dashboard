import { evaluateCandidateEligibility } from "@/lib/p187-1-canary-cohort-readiness/eligibility";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import { P188_1_RECOMMENDED_STAGE } from "@/lib/p188-1-hiring-recommendation-workflow/types";
import type { P1881RecommendHireResult } from "@/lib/p188-1-hiring-recommendation-workflow/types";

/**
 * Forecast P187 eligibility after successful Recommend Hire results (simulation only).
 * Does not enable P187 authority flags.
 */
export function forecastP187EligibilityAfterRecommendations(input: {
  workflows: CandidateWorkflowRecord[];
  successfulRecommendations: P1881RecommendHireResult[];
  jobByCandidate?: Record<string, string>;
}): {
  predictedEligibleCount: number;
  predictedEligibleIds: string[];
  p187AuthorityEnabled: false;
  operatorApprovalOccurred: false;
} {
  const byId = new Map(input.workflows.map((w) => [w.candidateId, w]));
  const predictedEligibleIds: string[] = [];

  for (const rec of input.successfulRecommendations) {
    if (!rec.ok) continue;
    const wf = byId.get(rec.candidateId);
    const status = wf?.workflowStatus ?? rec.resultingWorkflowStatus ?? "Needs Review";
    const result = evaluateCandidateEligibility({
      candidateId: rec.candidateId,
      workflowStatus: status === "Applied" ? "Qualified" : status,
      recommendedStage: P188_1_RECOMMENDED_STAGE,
      assignedRecruiter: wf?.assignedRecruiter && wf.assignedRecruiter !== "Unassigned"
        ? wf.assignedRecruiter
        : "Taylor",
      assignedDM: wf?.assignedDM && wf.assignedDM !== "Unassigned" ? wf.assignedDM : "Field Ops",
      jobAssignmentResolved: true,
      jobAssignmentRef: input.jobByCandidate?.[rec.candidateId] ?? "job-forecast",
      identityResolved: true,
      shadowPresent: true,
      shadowState: "HIRING_RECOMMENDATION",
      lifecycleMismatch: false,
      withdrawn: false,
      archived: false,
      duplicateApprovalEvent: false,
      conflictingOperation: false,
      unresolvedAuditIssue: false,
      rollbackStateAvailable: true,
      updatedAt: new Date().toISOString(),
      nowMs: Date.now(),
    });
    if (result.eligible) predictedEligibleIds.push(rec.candidateId);
  }

  return {
    predictedEligibleCount: predictedEligibleIds.length,
    predictedEligibleIds,
    p187AuthorityEnabled: false,
    operatorApprovalOccurred: false,
  };
}
