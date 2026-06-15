import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import type { CoverageRiskSnapshot } from "@/lib/coverage-risk-engine";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import type { ActiveRep } from "@/lib/rep-intelligence/rep-types";
import type { CandidateWorkflowState } from "@/lib/candidate-workflow-types";
import type { WorkforceOpsQueueItem } from "@/lib/workforce-ops-center/types";
import { buildTerritoryIntelligenceCenter } from "@/lib/territory-intelligence";
import { buildProjectRiskRows } from "@/lib/territory-action-engine/build-project-risk";
import { buildRecruiterWorkloadRows } from "@/lib/territory-action-engine/build-recruiter-workload";
import { buildRepCapacityRows } from "@/lib/territory-action-engine/build-rep-capacity";
import { buildTerritoryPlaybooks } from "@/lib/territory-action-engine/build-territory-playbooks";
import { mergeActionRecommendations } from "@/lib/territory-action-engine/merge-action-recommendations";
import type { TerritoryActionCenterSnapshot } from "@/lib/territory-action-engine/types";

export type TerritoryActionBuildContext = {
  jobs: BreezyJob[];
  candidates: BreezyCandidate[];
  workflows: CandidateWorkflowState;
  fetchedAt: string;
  coverage: CoverageRiskSnapshot;
  opportunities: MelOpportunity[];
  activeReps: ActiveRep[];
  workforceQueue: WorkforceOpsQueueItem[];
  actingRecruiter?: string;
};

export function buildTerritoryActionCenterSnapshot(
  ctx: TerritoryActionBuildContext,
): TerritoryActionCenterSnapshot {
  const territoryCenter = buildTerritoryIntelligenceCenter({
    jobs: ctx.jobs,
    candidates: ctx.candidates,
    fetchedAt: ctx.fetchedAt,
    coverage: ctx.coverage,
    workflows: ctx.workflows,
  });

  const projectRisks = buildProjectRiskRows(ctx.coverage);
  const recruiterWorkloads = buildRecruiterWorkloadRows({
    candidates: ctx.candidates,
    workflows: ctx.workflows,
  });
  const repCapacities = buildRepCapacityRows({
    reps: ctx.activeReps,
    opportunities: ctx.opportunities,
  });
  const territoryPlaybooks = buildTerritoryPlaybooks(territoryCenter.territories);

  const merged = mergeActionRecommendations({
    territoryCenter,
    workforceQueue: ctx.workforceQueue,
    coverage: ctx.coverage,
    projectRisks,
    repCapacities,
    recruiterWorkloads,
    candidates: ctx.candidates,
    workflows: ctx.workflows,
    actingRecruiter: ctx.actingRecruiter,
  });

  const criticalCount = merged.all.filter((card) => card.impactScore >= 80).length;

  return {
    fetchedAt: ctx.fetchedAt,
    priorityQueue: merged.priorityQueue,
    executiveRollup: merged.executiveRollup,
    dmActionQueue: merged.dmActionQueue,
    recruiterActionQueue: merged.recruiterActionQueue,
    territoryPlaybooks,
    projectRisks,
    recruiterWorkloads,
    repCapacities,
    actionBoard: merged.all.slice(0, 25),
    meta: {
      totalActions: merged.all.length,
      criticalCount,
      manualOnly: true,
    },
  };
}
