import type { ExecutiveAlert } from "@/lib/alerts/alert-types";
import type { ExecutiveAlertFollowUp } from "@/lib/alerts/executive-alert-status-types";
import { buildPredictiveTerritoryRiskSnapshot } from "@/lib/predictive-territory-risk";
import { buildCoverageForecastRows } from "@/lib/workforce-capacity-forecast/coverage-forecast";
import { countOpenCalls } from "@/lib/unified-recruiting-command-center/build-kpis";
import type { RecruitingIntelligenceRouteBundle } from "@/lib/recruiting-intelligence/load-recruiting-intelligence-route-bundle";
import type { CoverageForecastHorizonSummary } from "@/lib/executive-morning-brief/types";

export function buildMorningBriefCoverageForecast(input: {
  bundle: RecruitingIntelligenceRouteBundle;
  alerts: ExecutiveAlert[];
  followUps?: ExecutiveAlertFollowUp[];
}): CoverageForecastHorizonSummary[] {
  const riskSnapshot = buildPredictiveTerritoryRiskSnapshot({
    bundle: input.bundle,
    alerts: input.alerts,
    followUps: input.followUps ?? [],
  });
  const rows = buildCoverageForecastRows({ bundle: input.bundle, riskSnapshot });
  const company = rows.find((row) => row.scope === "company");
  if (!company) {
    const openCalls = countOpenCalls(input.bundle);
    const coverage = Math.round(input.bundle.coverage.executiveSummary.averageCoverageScore);
    return (["7d", "14d", "30d", "60d"] as const).map((horizon) => ({
      horizon,
      expectedOpenCalls: openCalls,
      expectedFilledCalls: Math.round(openCalls * 0.1),
      expectedCoveragePercent: coverage,
      projectedRiskScore: 100 - coverage,
      riskTrend: "stable" as const,
    }));
  }

  return company.forecasts.map((point) => {
    const openCalls = company.currentOpenCalls;
    const filled = Math.round(openCalls * (point.completionPercent / 100));
    return {
      horizon: point.horizon,
      expectedOpenCalls: Math.max(0, openCalls - point.openCallReduction),
      expectedFilledCalls: filled,
      expectedCoveragePercent: point.coveragePercent,
      projectedRiskScore: Math.max(0, 100 - point.coveragePercent),
      riskTrend: point.riskTrend,
    };
  });
}
