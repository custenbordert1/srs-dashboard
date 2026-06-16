import type {
  EffectivenessRating,
  OutcomeMetrics,
  RecommendationRecord,
} from "@/lib/recommendation-intelligence/types";
import { diffOutcomeMetrics } from "@/lib/recommendation-intelligence/metrics";

export function isSuccessfulEffectiveness(rating: EffectivenessRating | null): boolean {
  return rating === "Highly Effective" || rating === "Effective";
}

export function scoreEffectiveness(input: {
  expectedApplicantGain: number;
  baseline: OutcomeMetrics | null;
  current: OutcomeMetrics;
}): EffectivenessRating {
  const delta =
    input.baseline != null
      ? diffOutcomeMetrics(input.current, input.baseline)
      : input.current;

  const actualApplicantGain = delta.applicants;
  const expected = Math.max(1, input.expectedApplicantGain);

  if (actualApplicantGain < 0 || delta.coveragePercent < -5 || delta.riskScore < -10) {
    return "Negative Impact";
  }

  if (actualApplicantGain >= expected * 1.2) return "Highly Effective";
  if (actualApplicantGain >= expected * 0.8) return "Effective";
  if (actualApplicantGain >= expected * 0.4) return "Neutral";
  if (actualApplicantGain > 0) return "Ineffective";
  return "Ineffective";
}

export function computeSuccessRate(records: RecommendationRecord[]): number {
  const scored = records.filter((row) => row.effectiveness != null);
  if (scored.length === 0) return 0;
  const successes = scored.filter((row) => isSuccessfulEffectiveness(row.effectiveness)).length;
  return Math.round((successes / scored.length) * 100);
}

export function computeTypeSuccessRate(
  records: RecommendationRecord[],
  type: string,
): number {
  const scoped = records.filter((row) => row.recommendationType === type && row.effectiveness != null);
  if (scoped.length === 0) return 0;
  const successes = scoped.filter((row) => isSuccessfulEffectiveness(row.effectiveness)).length;
  return Math.round((successes / scoped.length) * 100);
}

export function computeRoiScore(input: {
  expectedApplicantGain: number;
  actualApplicantGain: number;
  effectiveness: EffectivenessRating | null;
}): number {
  const expected = Math.max(1, input.expectedApplicantGain);
  const ratio = input.actualApplicantGain / expected;
  const effectivenessBoost =
    input.effectiveness === "Highly Effective"
      ? 25
      : input.effectiveness === "Effective"
        ? 12
        : input.effectiveness === "Negative Impact"
          ? -20
          : 0;
  return Math.max(0, Math.min(100, Math.round(ratio * 55 + effectivenessBoost)));
}
