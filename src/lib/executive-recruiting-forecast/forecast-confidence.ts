import type { DataTrustLevel, ForecastConfidenceLevel } from "@/lib/executive-recruiting-forecast/types";

/**
 * Model confidence reflects input quality and sample depth — not statistical forecast accuracy.
 */
export function resolveForecastConfidence(input: {
  dataTrust: DataTrustLevel;
  recentHireCount: number;
  candidateCount: number;
  territoriesAtRisk: number;
}): ForecastConfidenceLevel {
  if (input.dataTrust === "degraded") return "low";
  if (input.dataTrust === "partial") return "moderate";
  if (input.recentHireCount < 2 && input.candidateCount < 25) return "low";
  if (input.recentHireCount < 5 || input.candidateCount < 50) return "moderate";
  if (input.territoriesAtRisk >= 5 && input.recentHireCount < 8) return "moderate";
  return "high";
}

export function forecastConfidenceLabel(level: ForecastConfidenceLevel): string {
  if (level === "high") return "High";
  if (level === "moderate") return "Moderate";
  return "Low";
}
