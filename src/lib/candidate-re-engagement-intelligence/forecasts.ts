import type { RawReEngagementOpportunity } from "@/lib/candidate-re-engagement-intelligence/opportunity-engine";
import type { TerritoryRecoveryForecast } from "@/lib/candidate-re-engagement-intelligence/types";
import { normalizeStateCode } from "@/lib/dm-territory-map";
import type { RecruitingIntelligenceRouteBundle } from "@/lib/recruiting-intelligence/load-recruiting-intelligence-route-bundle";

export function buildTerritoryRecoveryForecasts(input: {
  bundle: RecruitingIntelligenceRouteBundle;
  opportunities: RawReEngagementOpportunity[];
}): TerritoryRecoveryForecast[] {
  const byState = new Map<string, RawReEngagementOpportunity[]>();

  for (const opp of input.opportunities) {
    const state = normalizeStateCode(opp.row.state);
    if (!state) continue;
    const bucket = byState.get(state) ?? [];
    bucket.push(opp);
    byState.set(state, bucket);
  }

  const forecasts: TerritoryRecoveryForecast[] = [];

  for (const [state, rows] of byState) {
    const openCalls = input.bundle.opportunities.filter(
      (opp) => opp.openStatus && !opp.isStaffed && normalizeStateCode(opp.state) === state,
    ).length;
    const recoverableCandidates = rows.length;
    const avgPlacement =
      rows.reduce((sum, row) => sum + row.placementProbability, 0) / Math.max(1, rows.length);
    const potentialPlacements = Math.round((recoverableCandidates * avgPlacement) / 100);
    const coverageRows = input.bundle.coverage.opportunities.filter(
      (opp) => normalizeStateCode(opp.state) === state,
    );
    const avgCoverage =
      coverageRows.length > 0
        ? coverageRows.reduce((sum, row) => sum + row.coverageScore, 0) / coverageRows.length
        : 50;
    const coverageImprovementPercent = Math.min(
      25,
      Math.round(potentialPlacements * 3 + (100 - avgCoverage) * 0.08),
    );
    const openCallReduction = Math.min(openCalls, potentialPlacements);
    const recoveryOpportunityScore = Math.round(
      recoverableCandidates * 4 +
        potentialPlacements * 8 +
        coverageImprovementPercent * 2 +
        openCallReduction * 5,
    );

    forecasts.push({
      state,
      territoryLabel: state,
      recoverableCandidates,
      potentialPlacements,
      coverageImprovementPercent,
      openCallReduction,
      recoveryOpportunityScore,
    });
  }

  return forecasts.sort((a, b) => b.recoveryOpportunityScore - a.recoveryOpportunityScore);
}

export function buildExecutiveRecoverySummary(input: {
  opportunities: RawReEngagementOpportunity[];
  forecasts: TerritoryRecoveryForecast[];
}): {
  recoverableCandidates: number;
  potentialPlacements: number;
  estimatedCoverageGainPercent: number;
  topRecoveryTerritories: Array<{
    state: string;
    label: string;
    recoverableCandidates: number;
    recoveryOpportunityScore: number;
  }>;
} {
  const recoverableCandidates = input.opportunities.length;
  const potentialPlacements = input.forecasts.reduce((sum, row) => sum + row.potentialPlacements, 0);
  const estimatedCoverageGainPercent =
    input.forecasts.length > 0
      ? Math.round(
          input.forecasts.reduce((sum, row) => sum + row.coverageImprovementPercent, 0) /
            input.forecasts.length,
        )
      : 0;

  return {
    recoverableCandidates,
    potentialPlacements,
    estimatedCoverageGainPercent,
    topRecoveryTerritories: input.forecasts.slice(0, 5).map((row) => ({
      state: row.state,
      label: row.territoryLabel,
      recoverableCandidates: row.recoverableCandidates,
      recoveryOpportunityScore: row.recoveryOpportunityScore,
    })),
  };
}
