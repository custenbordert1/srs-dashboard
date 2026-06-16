import { diffOutcomeMetrics } from "@/lib/recommendation-intelligence/metrics";
import { latestOutcomeMetrics } from "@/lib/recommendation-intelligence/outcome-tracking";
import { computeRoiScore, isSuccessfulEffectiveness } from "@/lib/recommendation-intelligence/scoring";
import type { OutcomeMetrics, RecommendationRecord } from "@/lib/recommendation-intelligence/types";
import type { OutcomeDelta, RoiCategory } from "@/lib/executive-trust-roi/types";

export function outcomeDeltaForRecord(record: RecommendationRecord): OutcomeDelta | null {
  const baseline = record.baselineMetrics;
  const latest = latestOutcomeMetrics(record);
  if (!baseline || !latest) return null;
  return diffOutcomeMetrics(latest, baseline);
}

export function compositeImpactScore(delta: OutcomeMetrics, expectedApplicantGain: number): number {
  const expected = Math.max(1, expectedApplicantGain);
  const applicantComponent = (delta.applicants / expected) * 35;
  const hireComponent = delta.newHires * 8;
  const coverageComponent = delta.coveragePercent * 1.5;
  const openCallComponent = delta.openCalls * 3;
  const riskComponent = delta.riskScore * 0.8;
  return Math.round(
    applicantComponent + hireComponent + coverageComponent + openCallComponent + riskComponent,
  );
}

export function computeRoiCategory(record: RecommendationRecord): RoiCategory {
  if (!record.baselineMetrics || record.status === "Ignored") return "Not enough data";
  const delta = outcomeDeltaForRecord(record);
  if (!delta) return "Not enough data";

  if (record.effectiveness === "Negative Impact" || delta.applicants < 0 || delta.coveragePercent < -3) {
    return "Negative ROI";
  }

  if (record.effectiveness == null && record.status !== "Completed") {
    return "Not enough data";
  }

  const score = computeRoiScore({
    expectedApplicantGain: record.expectedApplicantGain,
    actualApplicantGain: delta.applicants,
    effectiveness: record.effectiveness,
  });
  const composite = compositeImpactScore(delta, record.expectedApplicantGain);

  if (record.effectiveness === "Highly Effective" || score >= 75 || composite >= 70) {
    return "High ROI";
  }
  if (record.effectiveness === "Effective" || score >= 50 || composite >= 45) {
    return "Medium ROI";
  }
  if (delta.applicants > 0 || delta.newHires > 0 || delta.coveragePercent > 0) {
    return "Low ROI";
  }
  if (record.effectiveness === "Ineffective" || score < 30) {
    return "Negative ROI";
  }
  return "Not enough data";
}

export function averageDelta(records: RecommendationRecord[]): OutcomeMetrics {
  const deltas = records.map(outcomeDeltaForRecord).filter((row): row is OutcomeMetrics => row != null);
  if (deltas.length === 0) {
    return {
      applicants: 0,
      interviews: 0,
      offers: 0,
      newHires: 0,
      coveragePercent: 0,
      openCalls: 0,
      riskScore: 0,
      projectCompletionPercent: 0,
    };
  }
  const sum = deltas.reduce(
    (acc, row) => ({
      applicants: acc.applicants + row.applicants,
      interviews: acc.interviews + row.interviews,
      offers: acc.offers + row.offers,
      newHires: acc.newHires + row.newHires,
      coveragePercent: acc.coveragePercent + row.coveragePercent,
      openCalls: acc.openCalls + row.openCalls,
      riskScore: acc.riskScore + row.riskScore,
      projectCompletionPercent: acc.projectCompletionPercent + row.projectCompletionPercent,
    }),
    {
      applicants: 0,
      interviews: 0,
      offers: 0,
      newHires: 0,
      coveragePercent: 0,
      openCalls: 0,
      riskScore: 0,
      projectCompletionPercent: 0,
    },
  );
  const count = deltas.length;
  return {
    applicants: Math.round(sum.applicants / count),
    interviews: Math.round(sum.interviews / count),
    offers: Math.round(sum.offers / count),
    newHires: Math.round(sum.newHires / count),
    coveragePercent: Math.round(sum.coveragePercent / count),
    openCalls: Math.round(sum.openCalls / count),
    riskScore: Math.round(sum.riskScore / count),
    projectCompletionPercent: Math.round(sum.projectCompletionPercent / count),
  };
}

export function typeSuccessRate(records: RecommendationRecord[]): number {
  const scored = records.filter((row) => row.effectiveness != null);
  if (scored.length === 0) return 0;
  return Math.round(
    (scored.filter((row) => isSuccessfulEffectiveness(row.effectiveness)).length / scored.length) * 100,
  );
}
