import type { DailyActionPlanSnapshot } from "@/lib/executive-daily-action-plan/types";
import type { PredictiveTerritoryRiskSnapshot } from "@/lib/predictive-territory-risk/types";
import type { RecruitingIntelligenceRouteBundle } from "@/lib/recruiting-intelligence/load-recruiting-intelligence-route-bundle";
import { countHiresLast7Days } from "@/lib/territory-intelligence/territory-intelligence-metrics";
import type { CommandCenterKpis } from "@/lib/unified-recruiting-command-center/types";

export function countOpenCalls(bundle: RecruitingIntelligenceRouteBundle): number {
  return bundle.opportunities.filter((row) => row.openStatus && !row.isStaffed).length;
}

export function buildCommandCenterKpis(input: {
  bundle: RecruitingIntelligenceRouteBundle;
  riskSnapshot: PredictiveTerritoryRiskSnapshot;
  dailyActionPlan: DailyActionPlanSnapshot;
}): CommandCenterKpis {
  const { bundle, riskSnapshot, dailyActionPlan } = input;
  const zeroPipelineStores = riskSnapshot.forecasts.filter(
    (forecast) => forecast.kind === "zero-pipeline-store",
  ).length;

  return {
    openCalls: countOpenCalls(bundle),
    criticalTerritories: riskSnapshot.executiveSummary.totalCriticalTerritories,
    zeroPipelineStores,
    coveragePercent: Math.round(bundle.coverage.executiveSummary.averageCoverageScore),
    hiringVelocity: countHiresLast7Days(bundle.candidates, bundle.fetchedAt),
    predictedCoverageGap: riskSnapshot.executiveSummary.predictedCoverageGap,
    actionsDueToday: dailyActionPlan.executiveSummary.mustDoCount,
  };
}
