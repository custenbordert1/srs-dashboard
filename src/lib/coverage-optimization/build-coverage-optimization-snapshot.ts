import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import type { CoverageRiskSnapshot } from "@/lib/coverage-risk-engine";
import { filterOpportunitiesByTerritory } from "@/lib/mel-matching/mel-opportunity-parser";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import type { ActiveRep } from "@/lib/rep-intelligence/rep-types";
import { prioritizeOpenCalls } from "@/lib/coverage-optimization/open-call-prioritizer";
import { buildRepRecommendations } from "@/lib/coverage-optimization/rep-recommendation-engine";
import type { CoverageOptimizationSnapshot } from "@/lib/coverage-optimization/types";

export type CoverageOptimizationContext = {
  jobs: BreezyJob[];
  candidates: BreezyCandidate[];
  opportunities: MelOpportunity[];
  activeReps: ActiveRep[];
  coverage: CoverageRiskSnapshot | null;
  fetchedAt: string;
  territoryStates?: string[] | null;
};

function buildExecutiveMetrics(
  recommendations: ReturnType<typeof buildRepRecommendations>,
): CoverageOptimizationSnapshot["executive"] {
  const noViable = recommendations
    .filter((row) => !row.bestRep || row.confidenceScore < 40)
    .map((row) => row.territoryOwner)
    .filter((value, index, array) => array.indexOf(value) === index)
    .slice(0, 10);

  const costByTerritory = new Map<string, number>();
  for (const row of recommendations) {
    const cost = row.bestRep?.estimatedTravelCostUsd ?? 0;
    const key = row.territoryOwner || "Unassigned";
    costByTerritory.set(key, (costByTerritory.get(key) ?? 0) + cost);
  }

  const highestCostTerritories = [...costByTerritory.entries()]
    .map(([territory, estimatedCostUsd]) => ({ territory, estimatedCostUsd }))
    .sort((a, b) => b.estimatedCostUsd - a.estimatedCostUsd)
    .slice(0, 8);

  const avgFill =
    recommendations.length > 0
      ? Math.round(
          recommendations.reduce((sum, row) => sum + row.fillProbability, 0) / recommendations.length,
        )
      : 0;

  const baselineCost = recommendations.reduce(
    (sum, row) => sum + (row.bestRep?.estimatedTravelCostUsd ?? 180),
    0,
  );
  const optimizedCost = recommendations.reduce(
    (sum, row) => sum + (row.bestRep?.estimatedTravelCostUsd ?? 0),
    0,
  );
  const optimizationSavingsUsd = Math.max(0, Math.round(baselineCost - optimizedCost));

  return {
    optimizationSavingsUsd,
    territoriesWithNoViableReps: noViable,
    highestCostTerritories,
    averageFillProbability: avgFill,
  };
}

export function buildCoverageOptimizationSnapshot(
  ctx: CoverageOptimizationContext,
): CoverageOptimizationSnapshot {
  const opportunities = filterOpportunitiesByTerritory(
    ctx.opportunities,
    ctx.territoryStates ?? undefined,
  );

  const recommendations = buildRepRecommendations(ctx.activeReps, opportunities, {
    territoryStates: ctx.territoryStates ?? undefined,
  });

  const prioritizedOpenCalls = prioritizeOpenCalls({
    opportunities,
    coverage: ctx.coverage,
    candidates: ctx.candidates,
    jobs: ctx.jobs,
    fetchedAt: ctx.fetchedAt,
  });

  return {
    fetchedAt: ctx.fetchedAt,
    recommendations,
    prioritizedOpenCalls,
    executive: buildExecutiveMetrics(recommendations),
  };
}
