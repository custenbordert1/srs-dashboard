import type {
  ImpactSimulation,
  ImpactSimulationScenario,
  RecoveryActionQueueItem,
  RecoveryCandidateAnalysis,
} from "@/lib/p119-autonomous-recovery-engine/types";

function scenario(
  label: string,
  actions: RecoveryActionQueueItem[],
  limit: number,
): ImpactSimulationScenario {
  const selected = actions.slice(0, limit);
  const candidateIds = [...new Set(selected.flatMap((action) => action.candidateIds))];
  const expectedPaperworkUnlocked = selected.reduce(
    (sum, action) => sum + action.estimatedPaperworkIncrease,
    0,
  );
  return {
    scenario: label,
    actionsIncluded: selected.length,
    expectedPaperworkUnlocked,
    candidateIds,
  };
}

export function buildImpactSimulation(input: {
  actionQueue: RecoveryActionQueueItem[];
  recoverableCandidates: RecoveryCandidateAnalysis[];
}): ImpactSimulation {
  const recoverableUnlock = input.recoverableCandidates
    .filter((candidate) => candidate.estimatedUnlock > 0)
    .reduce((sum, candidate) => sum + candidate.estimatedUnlock, 0);

  return {
    top5: scenario("If top 5 actions completed", input.actionQueue, 5),
    top10: scenario("If top 10 actions completed", input.actionQueue, 10),
    allRecoverable: {
      scenario: "If all recoverable issues completed",
      actionsIncluded: input.actionQueue.length,
      expectedPaperworkUnlocked: recoverableUnlock,
      candidateIds: input.recoverableCandidates
        .filter((candidate) => candidate.estimatedUnlock > 0)
        .map((candidate) => candidate.candidateId),
    },
  };
}
