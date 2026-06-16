import type { AutopilotRecommendation } from "@/lib/recruiting-autopilot/types";
import { AUTOPILOT_RECOMMENDATION_LABELS } from "@/lib/recruiting-autopilot/recommendation-labels";
import { computeTypeSuccessRate, isSuccessfulEffectiveness } from "@/lib/recommendation-intelligence/scoring";
import type { RecommendationRecord } from "@/lib/recommendation-intelligence/types";

export function buildLearnedSuccessRates(records: RecommendationRecord[]): Record<string, number> {
  const types = new Set(records.map((row) => row.recommendationType));
  const rates: Record<string, number> = {};
  for (const type of types) {
    rates[type] = computeTypeSuccessRate(records, type);
  }
  return rates;
}

export function adjustConfidenceScore(
  baseConfidence: number,
  recommendationType: string,
  learnedRates: Record<string, number>,
): number {
  const successRate = learnedRates[recommendationType];
  if (successRate == null || successRate === 0) return baseConfidence;
  const delta = Math.round((successRate - 50) * 0.3);
  return Math.max(20, Math.min(95, baseConfidence + delta));
}

export function applyLearnedConfidenceToRecommendations(
  recommendations: AutopilotRecommendation[],
  learnedRates: Record<string, number>,
): AutopilotRecommendation[] {
  if (Object.keys(learnedRates).length === 0) return recommendations;
  return recommendations.map((row) => {
    const adjusted = adjustConfidenceScore(row.confidenceScore, row.kind, learnedRates);
    if (adjusted === row.confidenceScore) return row;
    return {
      ...row,
      confidenceScore: adjusted,
      supportingMetrics: [
        ...row.supportingMetrics,
        {
          label: "Learned confidence",
          value: `${adjusted}% (${AUTOPILOT_RECOMMENDATION_LABELS[row.kind]})`,
        },
      ],
    };
  });
}

export function summarizeLearnedAdjustments(
  records: RecommendationRecord[],
): Record<string, number> {
  const rates = buildLearnedSuccessRates(records);
  const adjustments: Record<string, number> = {};
  for (const [type, rate] of Object.entries(rates)) {
    adjustments[type] = Math.round((rate - 50) * 0.3);
  }
  return adjustments;
}

export function countSuccessfulRecords(records: RecommendationRecord[]): number {
  return records.filter((row) => isSuccessfulEffectiveness(row.effectiveness)).length;
}
