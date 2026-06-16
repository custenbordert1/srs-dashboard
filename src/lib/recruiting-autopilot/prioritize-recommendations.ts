import { AUTOPILOT_HISTORICAL_EFFECTIVENESS } from "@/lib/recruiting-autopilot/recommendation-labels";
import type { AutopilotRecommendation } from "@/lib/recruiting-autopilot/types";

export type PrioritizationInput = {
  impactScore: number;
  confidenceScore: number;
  currentRisk: number;
  estimatedCoverageGain: number;
  estimatedCandidateGain: number;
  hiringVelocityRisk: number;
  deadlinePressure: number;
  kind: AutopilotRecommendation["kind"];
};

export function computePrioritizationScore(input: PrioritizationInput): number {
  const riskWeight = input.currentRisk;
  const coverageImpact = Math.min(100, input.estimatedCoverageGain * 2.5);
  const hiringVelocityImpact = input.hiringVelocityRisk;
  const deadlineImpact = input.deadlinePressure;
  const historicalEffectiveness = AUTOPILOT_HISTORICAL_EFFECTIVENESS[input.kind];

  const score =
    riskWeight * 0.25 +
    coverageImpact * 0.25 +
    hiringVelocityImpact * 0.2 +
    deadlineImpact * 0.15 +
    historicalEffectiveness * 0.15;

  return Math.max(0, Math.min(100, Math.round(score)));
}

export function sortAutopilotRecommendations(
  recommendations: AutopilotRecommendation[],
): AutopilotRecommendation[] {
  return [...recommendations].sort((a, b) => {
    if (b.prioritizationScore !== a.prioritizationScore) {
      return b.prioritizationScore - a.prioritizationScore;
    }
    if (b.impactScore !== a.impactScore) return b.impactScore - a.impactScore;
    return b.opportunity.expectedRoiScore - a.opportunity.expectedRoiScore;
  });
}

export function groupRecommendationsByKey(
  recommendations: AutopilotRecommendation[],
  key: (row: AutopilotRecommendation) => string,
): Record<string, AutopilotRecommendation[]> {
  const grouped: Record<string, AutopilotRecommendation[]> = {};
  for (const row of recommendations) {
    const bucket = key(row);
    grouped[bucket] = grouped[bucket] ? [...grouped[bucket], row] : [row];
  }
  for (const bucket of Object.keys(grouped)) {
    grouped[bucket] = sortAutopilotRecommendations(grouped[bucket]!);
  }
  return grouped;
}
