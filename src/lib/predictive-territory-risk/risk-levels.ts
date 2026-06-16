import type { PredictiveRiskLevel } from "@/lib/predictive-territory-risk/types";

export function riskLevelFromScore(score: number): PredictiveRiskLevel {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 40) return "moderate";
  return "stable";
}

export const PREDICTIVE_RISK_LEVEL_LABELS: Record<PredictiveRiskLevel, string> = {
  stable: "Stable",
  moderate: "Moderate",
  high: "High",
  critical: "Critical",
};

export const PREDICTIVE_RISK_TREND_LABELS = {
  improving: "Improving",
  stable: "Stable",
  declining: "Declining",
} as const;
