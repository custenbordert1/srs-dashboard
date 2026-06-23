import type { BreezyCandidate } from "@/lib/breezy-api";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import { upsertCandidateWorkflow } from "@/lib/candidate-workflow-store";
import type { RecruiterAssignmentDecision } from "@/lib/recruiter-assignment-engine/types";

export async function applyRecruiterAssignments(input: {
  decisions: RecruiterAssignmentDecision[];
  candidatesById: Map<string, BreezyCandidate>;
  workflows: Record<string, CandidateWorkflowRecord>;
  byUserId?: string;
}): Promise<CandidateWorkflowRecord[]> {
  const applied: CandidateWorkflowRecord[] = [];

  for (const decision of input.decisions) {
    if (!decision.shouldAssign) continue;

    const candidate = input.candidatesById.get(decision.candidateId);
    const existing = input.workflows[decision.candidateId];
    const record = await upsertCandidateWorkflow({
      candidateId: decision.candidateId,
      workflowStatus: existing?.workflowStatus ?? (candidate?.stage.toLowerCase().includes("applied") ? "Applied" : "Needs Review"),
      assignedRecruiter: decision.recruiter,
      recruiterAssignmentSource: "auto",
      recruiterAssignmentReason: decision.reason,
      recruiterAssignmentConfidence: decision.confidence,
      audit: {
        action: "auto_assign_recruiter",
        byUserId: input.byUserId,
        metadata: {
          assignedRecruiter: decision.recruiter,
          confidence: decision.confidence,
          reason: decision.reason,
          territoryState: decision.territoryState ?? "",
          dmName: decision.dmName ?? "",
        },
      },
    });
    applied.push(record);
    input.workflows[decision.candidateId] = record;
  }

  return applied;
}
