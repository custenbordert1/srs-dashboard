import type { DmOperatingSystemScope, DmTerritoryForecast } from "@/lib/dm-operating-system/types";
import { filterRiskRowsForDmScope } from "@/lib/dm-operating-system/filter-territory-scope";
import type { PredictiveRiskTrend, PredictiveTerritoryRiskSnapshot } from "@/lib/predictive-territory-risk/types";

const HORIZON_DAYS: Record<DmTerritoryForecast["horizon"], number> = {
  "7d": 7,
  "14d": 14,
  "30d": 30,
};

function trendFromDelta(delta: number): PredictiveRiskTrend {
  if (delta > 2) return "improving";
  if (delta < -2) return "declining";
  return "stable";
}

export function buildTerritoryForecast(input: {
  riskSnapshot: PredictiveTerritoryRiskSnapshot;
  scope: DmOperatingSystemScope;
  baseCoveragePercent: number;
  baseOpenCalls: number;
}): DmTerritoryForecast[] {
  const scopedDmRows = filterRiskRowsForDmScope(
    input.riskSnapshot.territories.filter((row) => row.entityType === "dm"),
    input.scope,
  );
  const territory =
    scopedDmRows.find((row) => row.dmName.toLowerCase() === input.scope.dmName.toLowerCase()) ??
    scopedDmRows[0];
  const baseRisk = territory?.riskScore ?? 50;
  const baseTrend = territory?.trend ?? "stable";
  const completionBase = Math.max(0, 100 - baseRisk * 0.6);

  return (Object.keys(HORIZON_DAYS) as DmTerritoryForecast["horizon"][]).map((horizon) => {
    const days = HORIZON_DAYS[horizon];
    const improvementFactor = days / 30;
    const riskReduction = Math.round(baseRisk * 0.15 * improvementFactor);
    const coverageGain = Math.round((100 - input.baseCoveragePercent) * 0.12 * improvementFactor);
    const coveragePercent = Math.min(100, input.baseCoveragePercent + coverageGain);
    const openCallReduction = Math.round(input.baseOpenCalls * 0.08 * improvementFactor);
    const completionPercent = Math.min(100, Math.round(completionBase + coverageGain * 0.5));
    const trend =
      baseTrend === "declining"
        ? trendFromDelta(-riskReduction)
        : baseTrend === "improving"
          ? trendFromDelta(riskReduction)
          : trendFromDelta(coverageGain - riskReduction);

    return {
      horizon,
      coveragePercent,
      completionPercent,
      openCallReduction,
      riskTrend: trend,
    };
  });
}
