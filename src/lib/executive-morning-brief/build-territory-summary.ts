import type { ExecutiveAlert } from "@/lib/alerts/alert-types";
import type { ExecutiveAlertFollowUp } from "@/lib/alerts/executive-alert-status-types";
import { buildPredictiveTerritoryRiskSnapshot } from "@/lib/predictive-territory-risk";
import type { RecruitingIntelligenceRouteBundle } from "@/lib/recruiting-intelligence/load-recruiting-intelligence-route-bundle";
import type { TerritoryRiskSummaryRow } from "@/lib/executive-morning-brief/types";

export function buildTerritoryRiskSummary(input: {
  bundle: RecruitingIntelligenceRouteBundle;
  alerts: ExecutiveAlert[];
  followUps?: ExecutiveAlertFollowUp[];
  limit?: number;
}): TerritoryRiskSummaryRow[] {
  const riskSnapshot = buildPredictiveTerritoryRiskSnapshot({
    bundle: input.bundle,
    alerts: input.alerts,
    followUps: input.followUps ?? [],
  });

  return riskSnapshot.territories
    .slice()
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, input.limit ?? 10)
    .map((row, index) => ({
      rank: index + 1,
      territoryLabel: row.label,
      dmName: row.dmName ?? row.label,
      riskLevel: row.riskLevel,
      coveragePercent: row.coveragePercent,
      openCalls: row.openCalls,
      applicants: row.pipelineDepth,
      activeReps: input.bundle.activeReps.filter((rep) =>
        row.states.includes(rep.state?.toUpperCase().slice(0, 2) ?? ""),
      ).length,
      riskTrend: row.trend,
      riskScore: row.riskScore,
    }));
}
