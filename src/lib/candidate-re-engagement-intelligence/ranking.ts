import type { RawReEngagementOpportunity } from "@/lib/candidate-re-engagement-intelligence/opportunity-engine";
import type { RecruitingIntelligenceRouteBundle } from "@/lib/recruiting-intelligence/load-recruiting-intelligence-route-bundle";
import { normalizeStateCode } from "@/lib/dm-territory-map";

function historicalActivityScore(row: RawReEngagementOpportunity["row"]): number {
  const historyCount = row.history.length;
  const commBoost = Math.min(25, historyCount * 5);
  const matchBoost = (row.matchPercent ?? 0) * 0.2;
  return Math.round(commBoost + matchBoost);
}

function coverageGapBoost(bundle: RecruitingIntelligenceRouteBundle, state: string): number {
  const code = normalizeStateCode(state);
  const coverageRows = bundle.coverage.opportunities.filter(
    (opp) => normalizeStateCode(opp.state) === code,
  );
  if (coverageRows.length === 0) return 20;
  const avgCoverage =
    coverageRows.reduce((sum, row) => sum + row.coverageScore, 0) / coverageRows.length;
  return Math.round((100 - avgCoverage) * 0.35);
}

export function scoreOpportunityRanking(
  raw: RawReEngagementOpportunity,
  bundle: RecruitingIntelligenceRouteBundle,
): number {
  const demandScore = raw.territoryImpact * 0.25;
  const qualityScore = (raw.row.matchPercent ?? 0) * 0.2 + raw.placementProbability * 0.15;
  const activityScore = historicalActivityScore(raw.row) * 0.15;
  const riskReduction = raw.reEngagementScore * 0.15;
  const coverageGain = coverageGapBoost(bundle, raw.row.state) * 0.1;

  return Math.round(
    Math.min(100, demandScore + qualityScore + activityScore + riskReduction + coverageGain),
  );
}

export function rankReEngagementOpportunities(
  rows: Array<RawReEngagementOpportunity & { rankingScore: number }>,
): Array<RawReEngagementOpportunity & { rankingScore: number }> {
  return [...rows].sort((left, right) => {
    if (right.rankingScore !== left.rankingScore) return right.rankingScore - left.rankingScore;
    if (right.reEngagementScore !== left.reEngagementScore) {
      return right.reEngagementScore - left.reEngagementScore;
    }
    return right.placementProbability - left.placementProbability;
  });
}
