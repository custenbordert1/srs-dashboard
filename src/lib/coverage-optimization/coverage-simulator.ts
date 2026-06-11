import { normalizeStateCode } from "@/lib/dm-territory-map";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import type { ActiveRep } from "@/lib/rep-intelligence/rep-types";
import { buildCoverageRiskSnapshot } from "@/lib/coverage-risk-engine";
import { buildCoverageGaps, territoryStaffingScore } from "@/lib/rep-intelligence/coverage-health";
import type { BreezyCandidate } from "@/lib/breezy-api";
import type { CoverageSimulationDelta } from "@/lib/coverage-optimization/types";

export type CoverageSimulationInput = {
  opportunities: MelOpportunity[];
  reps: ActiveRep[];
  candidates: BreezyCandidate[];
  fetchedAt: string;
  territoryStates?: string[];
  addRepIds?: string[];
  removeRepIds?: string[];
  moveRep?: { repId: string; newState: string; newCity?: string };
};

function applyRosterMutations(reps: ActiveRep[], input: CoverageSimulationInput): ActiveRep[] {
  let next = reps.map((rep) => ({ ...rep }));

  if (input.removeRepIds?.length) {
    const remove = new Set(input.removeRepIds);
    next = next.filter((rep) => !remove.has(rep.repId));
  }

  if (input.moveRep) {
    next = next.map((rep) =>
      rep.repId === input.moveRep!.repId
        ? {
            ...rep,
            state: normalizeStateCode(input.moveRep!.newState),
            city: input.moveRep!.newCity?.trim() || rep.city,
          }
        : rep,
    );
  }

  if (input.addRepIds?.length) {
    const existing = new Set(next.map((rep) => rep.repId));
    for (const rep of reps) {
      if (input.addRepIds.includes(rep.repId) && !existing.has(rep.repId)) {
        next.push({ ...rep, active: true });
      }
    }
  }

  return next;
}

function snapshotMetrics(
  opportunities: MelOpportunity[],
  reps: ActiveRep[],
  candidates: BreezyCandidate[],
  fetchedAt: string,
  territoryStates?: string[],
): { coveragePercent: number; riskScore: number; openCalls: number; atRisk: number } {
  const coverage = buildCoverageRiskSnapshot({
    opportunities,
    reps,
    candidates,
    fetchedAt,
    territoryStates,
  });
  const gaps = buildCoverageGaps(
    opportunities.filter((row) => row.openStatus),
    reps,
  );
  const coveragePercent = territoryStaffingScore(gaps);
  const riskScore =
    coverage.opportunities.length > 0
      ? Math.round(
          coverage.opportunities.reduce((sum, row) => sum + (100 - row.coverageScore), 0) /
            coverage.opportunities.length,
        )
      : 0;
  const openCalls = opportunities.filter((row) => row.openStatus && !row.isStaffed).length;
  const atRisk = gaps.filter((gap) => gap.health === "red").length;
  return { coveragePercent, riskScore, openCalls, atRisk };
}

export function simulateCoverageChange(input: CoverageSimulationInput): CoverageSimulationDelta {
  const baseline = snapshotMetrics(
    input.opportunities,
    input.reps,
    input.candidates,
    input.fetchedAt,
    input.territoryStates,
  );
  const mutatedReps = applyRosterMutations(input.reps, input);
  const simulated = snapshotMetrics(
    input.opportunities,
    mutatedReps,
    input.candidates,
    input.fetchedAt,
    input.territoryStates,
  );

  return {
    territoryCoveragePercent: simulated.coveragePercent,
    coverageRiskScore: simulated.riskScore,
    openCallsImpacted: Math.max(0, baseline.openCalls - simulated.openCalls),
    atRiskTerritories: simulated.atRisk,
    deltaCoveragePercent: simulated.coveragePercent - baseline.coveragePercent,
    deltaRiskScore: simulated.riskScore - baseline.riskScore,
  };
}

