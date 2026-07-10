import type { BreezyCandidate } from "@/lib/breezy-api";
import {
  dmAssignmentNeedsAttention,
  isDmUnassigned,
  suggestDmForCandidate,
} from "@/lib/candidate-dm-suggest";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import { upsertCandidateWorkflow } from "@/lib/candidate-workflow-store";

export async function applyTerritoryDmAssignments(input: {
  candidates: BreezyCandidate[];
  workflows: Record<string, CandidateWorkflowRecord>;
  jobsByPositionId?: Map<string, { state?: string }>;
  candidateIds?: string[];
  byUserId?: string;
}): Promise<CandidateWorkflowRecord[]> {
  const applied: CandidateWorkflowRecord[] = [];
  const idFilter = input.candidateIds ? new Set(input.candidateIds) : null;

  for (const candidate of input.candidates) {
    if (idFilter && !idFilter.has(candidate.candidateId)) continue;

    const existing = input.workflows[candidate.candidateId];
    if (!existing) continue;

    const jobState = candidate.positionId
      ? input.jobsByPositionId?.get(candidate.positionId)?.state
      : undefined;
    const suggestedDM = suggestDmForCandidate({
      candidateState: candidate.state,
      jobState,
      assignedDM: existing.assignedDM,
    });

    if (isDmUnassigned(suggestedDM)) continue;
    if (!dmAssignmentNeedsAttention(existing.assignedDM, suggestedDM)) continue;

    const record = await upsertCandidateWorkflow({
      candidateId: candidate.candidateId,
      assignedDM: suggestedDM,
      audit: {
        action: "auto_assign_dm_territory",
        byUserId: input.byUserId,
        metadata: {
          previousAssignedDM: existing.assignedDM,
          assignedDM: suggestedDM,
          territoryState: candidate.state ?? jobState ?? "",
        },
      },
    });
    applied.push(record);
    input.workflows[candidate.candidateId] = record;
  }

  return applied;
}
