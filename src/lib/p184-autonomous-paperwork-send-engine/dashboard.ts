import type { BreezyJob } from "@/lib/breezy-api";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import { evaluateP184Eligibility } from "@/lib/p184-autonomous-paperwork-send-engine/evaluator";
import { buildP184DashboardMetrics } from "@/lib/p184-autonomous-paperwork-send-engine/engine";
import { loadP184EngineState } from "@/lib/p184-autonomous-paperwork-send-engine/store";
import type { P184DashboardMetrics } from "@/lib/p184-autonomous-paperwork-send-engine/types";

/** Read-only metrics snapshot — does not mutate queue or send. */
export async function getP184DashboardSnapshot(input: {
  candidates: ScoredCandidateWorkflowRow[];
  onboardingByCandidateId: Map<string, CandidateOnboardingRecord>;
  jobsByPositionId: Map<string, BreezyJob>;
}): Promise<{ metrics: P184DashboardMetrics; eligibleNow: number }> {
  const state = await loadP184EngineState();
  const completedKeys = new Set(state.completedIdempotencyKeys);
  let eligibleNow = 0;
  for (const row of input.candidates) {
    const result = evaluateP184Eligibility({
      row,
      onboarding: input.onboardingByCandidateId.get(row.candidateId) ?? null,
      job: row.positionId ? input.jobsByPositionId.get(row.positionId) : null,
      config: state.config,
      queueItems: state.queue,
      completedIdempotencyKeys: completedKeys,
    });
    if (result.eligible) eligibleNow += 1;
  }
  return {
    eligibleNow,
    metrics: buildP184DashboardMetrics({
      config: state.config,
      queue: state.queue,
      sendTimestamps: state.sendTimestamps,
      eligibleNow,
    }),
  };
}
