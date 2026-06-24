import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import { upsertCandidateWorkflow } from "@/lib/candidate-workflow-store";
import type { CandidateProgressionDecision } from "@/lib/candidate-progression-engine/types";

export async function applyCandidateProgressions(input: {
  decisions: CandidateProgressionDecision[];
  workflows: Record<string, CandidateWorkflowRecord>;
  byUserId?: string;
}): Promise<CandidateWorkflowRecord[]> {
  const applied: CandidateWorkflowRecord[] = [];

  for (const decision of input.decisions) {
    if (!decision.shouldPersist) continue;

    const existing = input.workflows[decision.candidateId];
    if (!existing) continue;

    const record = await upsertCandidateWorkflow({
      candidateId: decision.candidateId,
      workflowStatus: existing.workflowStatus,
      recommendedStage: decision.recommendedStage,
      progressionReason: decision.progressionReason,
      progressionConfidence: decision.progressionConfidence,
      progressionPriority: decision.progressionPriority,
      progressionGeneratedAt: new Date().toISOString(),
      audit: {
        action: "generate_candidate_progression",
        byUserId: input.byUserId,
        metadata: {
          recommendedStage: decision.recommendedStage,
          progressionStageType: decision.progressionStageType,
          progressionPriority: decision.progressionPriority,
          progressionConfidence: decision.progressionConfidence,
        },
      },
    });
    applied.push(record);
    input.workflows[decision.candidateId] = record;
  }

  return applied;
}
