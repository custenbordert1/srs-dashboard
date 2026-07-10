import type { BreezyCandidate } from "@/lib/breezy-api";
import { resolveP178ReadyCandidateIds } from "@/lib/p181-scoped-operator-paperwork-queue/resolve-p178-ready-candidate-ids";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import { loadP109ReviewRecords } from "@/lib/p109-project-mapping-review/review-decision-store";
import type { P1851ApprovedMappingHint } from "@/lib/p185-1-paperwork-eligibility-recovery/jobMapping";

/**
 * Recover operator-intent paperwork candidates from P181/P178/P109 without duplicating queues.
 */
export async function loadP1851OperatorEvidence(input: {
  candidates: BreezyCandidate[];
  workflows: Record<string, CandidateWorkflowRecord>;
}): Promise<{
  operatorQueueIds: Set<string>;
  approvedMappings: P1851ApprovedMappingHint[];
  p178ReadyIds: string[];
}> {
  const p178ReadyIds = await resolveP178ReadyCandidateIds({
    candidates: input.candidates,
    workflows: input.workflows,
  }).catch(() => [] as string[]);

  const p109 = await loadP109ReviewRecords().catch(() => []);
  const approvedMappings: P1851ApprovedMappingHint[] = p109
    .filter((r) => r.decision === "approved" && r.recommendedPositionId)
    .map((r) => ({
      candidateId: r.candidateId,
      closedPositionId: r.closedPositionId,
      recommendedPositionId: r.recommendedPositionId!,
    }));

  // Candidates with Paperwork Sent / Signed already in operator path — not "new packet"
  // Operator queue evidence = P178 ready ∪ explicit paperwork-needed workflows historically
  const operatorQueueIds = new Set<string>(p178ReadyIds);

  // Also treat requiredAction "Send Paperwork" style if present on workflow
  for (const [id, wf] of Object.entries(input.workflows)) {
    const action = `${wf.requiredAction ?? ""}`.toLowerCase();
    if (action.includes("send paperwork") || wf.workflowStatus === "Paperwork Needed") {
      operatorQueueIds.add(id);
    }
  }

  return { operatorQueueIds, approvedMappings, p178ReadyIds };
}
