import { forecastConfidenceLabel } from "@/lib/executive-recruiting-forecast/forecast-confidence";
import type {
  ExecutiveForecastRecommendation,
  ExecutiveForecastSummary,
  ForecastConfidenceLevel,
  TerritoryShortageForecastRow,
} from "@/lib/executive-recruiting-forecast/types";

export function buildExecutiveForecastSummary(input: {
  territoriesAtRisk: number;
  overloadedRecruiters: number;
  overloadedDms: number;
  territoryShortages: TerritoryShortageForecastRow[];
  topRecommendation: ExecutiveForecastRecommendation | null;
  forecastConfidence: ForecastConfidenceLevel;
}): ExecutiveForecastSummary {
  const topRiskTerritory = input.territoryShortages[0] ?? null;
  const topLine = input.topRecommendation?.title ?? "No urgent actions — monitor capacity weekly.";
  const narrative = [
    `${input.territoriesAtRisk} ${input.territoriesAtRisk === 1 ? "territory" : "territories"} likely to miss coverage.`,
    `${input.overloadedRecruiters} ${input.overloadedRecruiters === 1 ? "recruiter" : "recruiters"} overloaded.`,
    `Top recommendation: ${topLine}`,
    `Forecast confidence: ${forecastConfidenceLabel(input.forecastConfidence)}.`,
  ].join(" ");

  return {
    territoriesAtRisk: input.territoriesAtRisk,
    overloadedRecruiters: input.overloadedRecruiters,
    overloadedDms: input.overloadedDms,
    topRiskTerritory: topRiskTerritory
      ? { dmName: topRiskTerritory.dmName, territoryLabel: topRiskTerritory.territoryLabel }
      : null,
    topRecommendation: input.topRecommendation,
    forecastConfidence: input.forecastConfidence,
    narrative,
  };
}

export function formatForecastFreshness(generatedAt: string, referenceMs = Date.now()): string {
  const parsed = new Date(generatedAt).getTime();
  if (Number.isNaN(parsed)) return "Updated recently";
  const minutes = Math.max(0, Math.round((referenceMs - parsed) / (60 * 1000)));
  if (minutes < 1) return "Updated just now";
  if (minutes === 1) return "Updated 1 minute ago";
  return `Updated ${minutes} minutes ago`;
}
