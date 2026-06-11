import { repReliabilityScore, repUtilizationPercent } from "@/lib/rep-intelligence/rep-scoring";
import { fillProbabilityFromMatch } from "@/lib/rep-intelligence/coverage-health";
import type { ActiveRep } from "@/lib/rep-intelligence/rep-types";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import { rankRepsForOpportunity } from "@/lib/workforce-intelligence/best-rep-matcher";
import {
  estimateDriveTimeMinutes,
  estimateProjectTravelCostUsd,
  requiresOvernightStay,
} from "@/lib/coverage-optimization/travel-cost-model";
import type {
  OpportunityRepRecommendation,
  ScoredRepRecommendation,
} from "@/lib/coverage-optimization/types";

const TOP_ALTERNATIVES = 5;

function qualityScoreForRep(rep: ActiveRep): number {
  return Math.round(repReliabilityScore(rep) * 0.7 + (100 - rep.noShowRate) * 0.3);
}

function availabilityScoreForRep(rep: ActiveRep): number {
  if (!rep.active) return 0;
  const utilization = repUtilizationPercent(rep);
  const loginDays = rep.lastLoginDaysAgo ?? null;
  const loginBoost =
    loginDays === null ? 40 : loginDays <= 7 ? 100 : loginDays <= 30 ? 70 : 30;
  return Math.round(Math.max(0, 100 - utilization) * 0.5 + loginBoost * 0.5);
}

function confidenceScoreForRep(
  rep: ActiveRep,
  matchScore: number,
  distanceMiles: number | null,
): number {
  const distanceFactor =
    distanceMiles === null ? 40 : distanceMiles <= 25 ? 100 : distanceMiles <= 50 ? 75 : distanceMiles <= 100 ? 50 : 25;
  return Math.round(
    matchScore * 0.45 +
      qualityScoreForRep(rep) * 0.2 +
      availabilityScoreForRep(rep) * 0.2 +
      distanceFactor * 0.15,
  );
}

function enrichRepRow(rep: ActiveRep, row: ReturnType<typeof rankRepsForOpportunity>[number]): ScoredRepRecommendation {
  const driveTimeMinutes = estimateDriveTimeMinutes(row.distanceMiles);
  return {
    ...row,
    qualityScore: qualityScoreForRep(rep),
    availabilityScore: availabilityScoreForRep(rep),
    confidenceScore: confidenceScoreForRep(rep, row.matchScore, row.distanceMiles),
    travelTimeMinutes: driveTimeMinutes,
    overnightRequired: requiresOvernightStay(driveTimeMinutes, row.distanceMiles),
    estimatedTravelCostUsd: estimateProjectTravelCostUsd({
      distanceMiles: row.distanceMiles,
      driveTimeMinutes,
    }),
  };
}

export function buildRepRecommendation(
  reps: ActiveRep[],
  opportunity: MelOpportunity,
  options?: { territoryStates?: string[] },
): OpportunityRepRecommendation {
  const ranked = rankRepsForOpportunity(reps, opportunity, {
    territoryStates: options?.territoryStates,
    limit: TOP_ALTERNATIVES,
  });

  const repById = new Map(reps.map((rep) => [rep.repId, rep]));
  const scored = ranked
    .map((row) => {
      const rep = repById.get(row.repId);
      return rep ? enrichRepRow(rep, row) : null;
    })
    .filter((row): row is ScoredRepRecommendation => row !== null);

  const bestRep = scored[0] ?? null;
  const confidenceScore = bestRep?.confidenceScore ?? 0;
  const fillProbability = bestRep
    ? fillProbabilityFromMatch(bestRep.matchScore, !opportunity.isStaffed)
    : 5;

  return {
    opportunityId: opportunity.opportunityId,
    projectName: opportunity.projectName,
    client: opportunity.client,
    city: opportunity.city,
    state: opportunity.state,
    territoryOwner: opportunity.territoryOwner,
    bestRep,
    alternatives: scored,
    confidenceScore,
    fillProbability,
  };
}

export function buildRepRecommendations(
  reps: ActiveRep[],
  opportunities: MelOpportunity[],
  options?: { territoryStates?: string[] },
): OpportunityRepRecommendation[] {
  return opportunities
    .filter((row) => row.openStatus && !row.isStaffed)
    .map((opportunity) => buildRepRecommendation(reps, opportunity, options))
    .sort((a, b) => b.confidenceScore - a.confidenceScore);
}