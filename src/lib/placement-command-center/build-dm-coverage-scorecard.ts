import type { CoverageRiskSnapshot } from "@/lib/coverage-risk-engine";
import { DISTRICT_MANAGERS, getAssignedStatesForDm, normalizeStateCode } from "@/lib/dm-territory-map";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import type { ActiveRep } from "@/lib/rep-intelligence/rep-types";
import { buildTerritoryIntelligenceCenter } from "@/lib/territory-intelligence";
import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import type { DmCoverageScorecardRow } from "@/lib/placement-command-center/types";

export function buildDmCoverageScorecard(input: {
  jobs: BreezyJob[];
  candidates: BreezyCandidate[];
  opportunities: MelOpportunity[];
  coverage: CoverageRiskSnapshot | null;
  activeReps: ActiveRep[];
  fetchedAt: string;
}): DmCoverageScorecardRow[] {
  const center = buildTerritoryIntelligenceCenter({
    jobs: input.jobs,
    candidates: input.candidates,
    fetchedAt: input.fetchedAt,
    coverage: input.coverage,
    workflows: null,
  });

  const territoryByDm = new Map(center.territories.map((row) => [row.dmName, row.metrics]));
  const openByDm = new Map<string, number>();
  const filledByDm = new Map<string, number>();

  for (const dmName of DISTRICT_MANAGERS) {
    const states = new Set(getAssignedStatesForDm(dmName).map(normalizeStateCode));
    const scoped = input.opportunities.filter((row) => states.has(normalizeStateCode(row.state)));
    openByDm.set(
      dmName,
      scoped.filter((row) => row.openStatus && !row.isStaffed).length,
    );
    filledByDm.set(
      dmName,
      scoped.filter((row) => row.isStaffed || !row.openStatus).length,
    );
  }

  const activeRepsByDm = new Map<string, number>();
  for (const rep of input.activeReps) {
    const dm = rep.dmOwner?.trim() || "Unassigned";
    activeRepsByDm.set(dm, (activeRepsByDm.get(dm) ?? 0) + 1);
  }

  return DISTRICT_MANAGERS.map((dmName) => {
    const metrics = territoryByDm.get(dmName);
    const openCalls = openByDm.get(dmName) ?? 0;
    const filled = filledByDm.get(dmName) ?? 0;
    const total = openCalls + filled;
    const coveragePercent = metrics?.coveragePercent ?? (total > 0 ? Math.round((filled / total) * 100) : 100);
    const repCount = activeRepsByDm.get(dmName) ?? metrics?.activeReps ?? 0;
    const repUtilizationPercent =
      repCount > 0 ? Math.min(100, Math.round((openCalls / Math.max(1, repCount)) * 25)) : 0;
    const placementVelocity = metrics?.hiresLast7Days ?? filled;
    const openCallReduction = Math.max(0, 100 - openCalls * 4);

    const score = Math.round(
      coveragePercent * 0.35 +
        openCallReduction * 0.25 +
        placementVelocity * 4 +
        (100 - repUtilizationPercent) * 0.15,
    );

    return {
      dmName,
      coveragePercent,
      repUtilizationPercent,
      placementVelocity,
      openCallReduction: Math.min(100, openCallReduction),
      openCalls,
      score: Math.min(100, score),
    };
  }).sort((a, b) => a.score - b.score);
}
