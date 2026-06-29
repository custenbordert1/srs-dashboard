import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import { upsertCandidateWorkflow } from "@/lib/candidate-workflow-store";
import type { CandidateAdvancementDecision } from "@/lib/candidate-advancement-engine/types";
import { ADVANCEMENT_ACTION_LABELS } from "@/lib/candidate-advancement-engine/types";

export type CandidateAdvancementApplyResult = {
  records: CandidateWorkflowRecord[];
  advanced: number;
};

export async function applyCandidateAdvancements(input: {
  decisions: CandidateAdvancementDecision[];
  workflows: Record<string, CandidateWorkflowRecord>;
  byUserId?: string;
}): Promise<CandidateAdvancementApplyResult> {
  const records: CandidateWorkflowRecord[] = [];
  let advanced = 0;
  const now = new Date().toISOString();
  const today = now.slice(0, 10);

  for (const decision of input.decisions) {
    if (!decision.shouldPersist) continue;

    const existing = input.workflows[decision.candidateId];
    if (!existing) continue;

    if (decision.action === "send-paperwork" && decision.shouldAdvance) {
      const record = await upsertCandidateWorkflow({
        candidateId: decision.candidateId,
        workflowStatus: "Paperwork Needed",
        requiredAction: "Send Paperwork",
        actionType: "send-paperwork",
        actionPriority: "high",
        actionReason: decision.reason,
        actionDueDate: today,
        actionConfidence: decision.confidence,
        actionGeneratedAt: now,
        recommendedStage: ADVANCEMENT_ACTION_LABELS["send-paperwork"],
        progressionReason: decision.reason,
        progressionConfidence: decision.confidence,
        progressionPriority: "high",
        progressionGeneratedAt: now,
        audit: {
          action: "candidate_advancement_p83",
          byUserId: input.byUserId,
          metadata: {
            advancementAction: decision.action,
            shouldAdvance: decision.shouldAdvance,
            requiresApproval: decision.requiresApproval,
            previousWorkflowStatus: existing.workflowStatus,
            previousActionType: existing.actionType ?? "none",
          },
        },
      });
      records.push(record);
      input.workflows[decision.candidateId] = record;
      advanced += 1;
      continue;
    }

    if (decision.action === "none") continue;

    const label = ADVANCEMENT_ACTION_LABELS[decision.action];
    const record = await upsertCandidateWorkflow({
      candidateId: decision.candidateId,
      workflowStatus: existing.workflowStatus,
      recommendedStage: label,
      progressionReason: decision.reason,
      progressionConfidence: decision.confidence,
      progressionPriority:
        decision.action === "reject" || decision.action === "call-first" ? "high" : "medium",
      progressionGeneratedAt: now,
      audit: {
        action: "candidate_advancement_p83",
        byUserId: input.byUserId,
        metadata: {
          advancementAction: decision.action,
          shouldAdvance: decision.shouldAdvance,
          requiresApproval: decision.requiresApproval,
          recommendedStage: label,
        },
      },
    });
    records.push(record);
    input.workflows[decision.candidateId] = record;
  }

  return { records, advanced };
}
