import type { BreezyCandidate } from "@/lib/breezy-api";
import { getCandidateWorkflowState, upsertCandidateWorkflow } from "@/lib/candidate-workflow-store";
import type {
  CandidateWorkflowRecord,
  CandidateWorkflowStatus,
} from "@/lib/candidate-workflow-types";
import { hasAdvancedPaperworkState } from "@/lib/workflow-onboarding-reconciliation/workflow-durability";

function initialWorkflowStatus(candidate: BreezyCandidate): CandidateWorkflowStatus {
  const stage = candidate.stage.toLowerCase();
  if (stage.includes("not qualified") || stage.includes("disqualif")) return "Not Qualified";
  if (stage.includes("qualified")) return "Qualified";
  if (stage.includes("applied")) return "Applied";
  if (stage.includes("paperwork")) return "Paperwork Needed";
  if (stage.includes("signed")) return "Signed";
  return "Needs Review";
}

export async function backfillWorkflowRecordsForCandidates(input: {
  candidates: BreezyCandidate[];
  workflows: Record<string, CandidateWorkflowRecord>;
  byUserId?: string;
}): Promise<{ created: number; records: CandidateWorkflowRecord[] }> {
  const persisted = await getCandidateWorkflowState();
  const records: CandidateWorkflowRecord[] = [];
  let created = 0;

  for (const [candidateId, record] of Object.entries(persisted)) {
    input.workflows[candidateId] = record;
  }

  for (const candidate of input.candidates) {
    const existing = persisted[candidate.candidateId] ?? input.workflows[candidate.candidateId];
    if (existing) {
      input.workflows[candidate.candidateId] = existing;
      continue;
    }

    const inMemory = input.workflows[candidate.candidateId];
    if (inMemory && hasAdvancedPaperworkState(inMemory)) {
      continue;
    }

    const record = await upsertCandidateWorkflow({
      candidateId: candidate.candidateId,
      workflowStatus: initialWorkflowStatus(candidate),
      assignedRecruiter: "Unassigned",
      audit: {
        action: "ingestion_import",
        byUserId: input.byUserId,
        metadata: {
          positionId: candidate.positionId,
          positionName: candidate.positionName,
          appliedDate: candidate.appliedDate,
        },
      },
    });
    records.push(record);
    input.workflows[candidate.candidateId] = record;
    created += 1;
  }

  return { created, records };
}
