import type { BreezyCandidate } from "@/lib/breezy-api";
import { getDmForState, normalizeStateCode } from "@/lib/dm-territory-map";
import { filterOpportunitiesByTerritory } from "@/lib/mel-matching/mel-opportunity-parser";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import type { ActiveRep } from "@/lib/rep-intelligence/rep-types";
import { scoreOpportunityCoverage } from "@/lib/coverage-risk-engine/opportunity-coverage";
import { buildPipelineCountsByState } from "@/lib/coverage-risk-engine/pipeline-signal";
import type {
  CoverageRiskExecutiveSummary,
  CoverageRiskSnapshot,
  DmCoverageRiskAlerts,
  HighOpportunityLowRepMarket,
  OpportunityCoverageRow,
  StaffingRiskLevel,
  StateStaffingDensityRow,
} from "@/lib/coverage-risk-engine/types";

function buildStateDensityRows(
  opportunities: OpportunityCoverageRow[],
  reps: ActiveRep[],
): StateStaffingDensityRow[] {
  const byState = new Map<string, { open: number; reps: Set<string> }>();

  for (const row of opportunities) {
    const entry = byState.get(row.state) ?? { open: 0, reps: new Set<string>() };
    entry.open += 1;
    byState.set(row.state, entry);
  }

  for (const rep of reps.filter((r) => r.active)) {
    const state = normalizeStateCode(rep.state);
    const entry = byState.get(state) ?? { open: 0, reps: new Set<string>() };
    entry.reps.add(rep.repId);
    byState.set(state, entry);
  }

  const rows: StateStaffingDensityRow[] = [];
  for (const [state, stats] of byState.entries()) {
    const activeReps = stats.reps.size;
    const densityRatio =
      stats.open > 0 ? Math.round((activeReps / stats.open) * 100) / 100 : activeReps;
    let staffingRisk: StaffingRiskLevel = "GREEN";
    if (stats.open > 0 && activeReps === 0) staffingRisk = "RED";
    else if (densityRatio < 0.25) staffingRisk = "RED";
    else if (densityRatio < 0.5) staffingRisk = "YELLOW";

    rows.push({
      state,
      territoryOwner: getDmForState(state) ?? "Unassigned",
      openOpportunities: stats.open,
      activeReps,
      densityRatio,
      staffingRisk,
    });
  }

  return rows.sort((a, b) => a.densityRatio - b.densityRatio || b.openOpportunities - a.openOpportunities);
}

function buildHighOpportunityLowRepMarkets(
  densityRows: StateStaffingDensityRow[],
): HighOpportunityLowRepMarket[] {
  return densityRows
    .filter((r) => r.openOpportunities >= 2 && r.activeReps <= 1)
    .map((r) => ({
      state: r.state,
      territoryOwner: r.territoryOwner,
      openOpportunities: r.openOpportunities,
      activeReps: r.activeReps,
      gapScore: r.openOpportunities * 10 - r.activeReps * 5,
    }))
    .sort((a, b) => b.gapScore - a.gapScore)
    .slice(0, 12);
}

function buildDmAlerts(opportunities: OpportunityCoverageRow[]): DmCoverageRiskAlerts {
  const highRiskProjects = opportunities
    .filter((o) => o.staffingRisk === "RED")
    .sort((a, b) => a.coverageScore - b.coverageScore)
    .slice(0, 12);

  const noNearbyReps = opportunities
    .filter((o) => o.nearby.activeWithin50 === 0)
    .sort((a, b) => a.coverageScore - b.coverageScore)
    .slice(0, 12);

  const recruitingUrgency = opportunities
    .filter((o) => o.staffingRisk === "RED" || (o.staffingRisk === "YELLOW" && o.pipelineScore < 35))
    .sort((a, b) => a.coverageScore - b.coverageScore)
    .slice(0, 10);

  const bestAvailableReps = [...highRiskProjects, ...noNearbyReps]
    .filter(
      (row, index, arr) => arr.findIndex((r) => r.opportunityId === row.opportunityId) === index,
    )
    .slice(0, 8)
    .map((row) => ({
      opportunityId: row.opportunityId,
      projectName: row.projectName,
      storeName: row.storeName,
      state: row.state,
      staffingRisk: row.staffingRisk,
      topRep: row.topRecommendedReps[0] ?? null,
    }));

  return {
    highRiskProjects,
    noNearbyReps,
    recruitingUrgency,
    bestAvailableReps,
  };
}

export function buildCoverageRiskSnapshot(input: {
  opportunities: MelOpportunity[];
  reps: ActiveRep[];
  candidates: BreezyCandidate[];
  fetchedAt: string;
  territoryStates?: string[];
}): CoverageRiskSnapshot {
  const openUnstaffed = filterOpportunitiesByTerritory(
    input.opportunities.filter((o) => o.openStatus && !o.isStaffed),
    input.territoryStates,
  );

  const pipelineByState = buildPipelineCountsByState(input.candidates, input.territoryStates);

  const scored = openUnstaffed
    .map((opportunity) =>
      scoreOpportunityCoverage(opportunity, input.reps, pipelineByState, {
        territoryStates: input.territoryStates,
      }),
    )
    .sort((a, b) => a.coverageScore - b.coverageScore);

  const densityRows = buildStateDensityRows(scored, input.reps);
  const executiveSummary: CoverageRiskExecutiveSummary = {
    totalOpenOpportunities: scored.length,
    highRiskProjectCount: scored.filter((o) => o.staffingRisk === "RED").length,
    yellowRiskProjectCount: scored.filter((o) => o.staffingRisk === "YELLOW").length,
    zeroNearbyRepProjects: scored.filter((o) => o.nearby.activeWithin50 === 0).length,
    averageCoverageScore:
      scored.length > 0
        ? Math.round(scored.reduce((sum, o) => sum + o.coverageScore, 0) / scored.length)
        : 100,
    lowDensityStates: densityRows.filter((r) => r.staffingRisk !== "GREEN").slice(0, 10),
    highOpportunityLowRepMarkets: buildHighOpportunityLowRepMarkets(densityRows),
  };

  return {
    fetchedAt: input.fetchedAt,
    territoryStates: input.territoryStates ?? null,
    opportunities: scored,
    executiveSummary,
    dmAlerts: buildDmAlerts(scored),
  };
}
