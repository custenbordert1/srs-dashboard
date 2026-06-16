import type { PredictiveRiskFactors } from "@/lib/predictive-territory-risk/types";

export type RiskScoreInput = {
  openCalls: number;
  pipelineDepth: number;
  applicantVelocityCurrent7d: number;
  applicantVelocityPrior7d: number;
  hiresLast7Days: number;
  coveragePercent: number;
  atRiskProjectRatio: number;
  highPriorityOpenRatio: number;
  alertCount: number;
  followUpCount: number;
  overdueFollowUpCount: number;
};

export function computeRiskFactors(input: RiskScoreInput): PredictiveRiskFactors {
  const openCallsPressure = Math.min(100, Math.round(input.openCalls * 7));
  const pipelineDepthRisk = Math.min(
    100,
    Math.round(100 - Math.min(input.pipelineDepth, 12) * (100 / 12)),
  );

  const velocityDelta = input.applicantVelocityCurrent7d - input.applicantVelocityPrior7d;
  let applicationVelocityRisk = 35;
  if (velocityDelta < -2) applicationVelocityRisk = 90;
  else if (velocityDelta < 0) applicationVelocityRisk = 70;
  else if (velocityDelta === 0) applicationVelocityRisk = 45;
  else if (velocityDelta <= 2) applicationVelocityRisk = 25;
  else applicationVelocityRisk = 10;

  const hiringVelocityRisk = Math.min(
    100,
    Math.round(100 - Math.min(input.hiresLast7Days, 8) * 12.5),
  );
  const coverageGapRisk = Math.min(100, Math.round(100 - input.coveragePercent));
  const completionTrendRisk = Math.min(100, Math.round(input.atRiskProjectRatio * 100));
  const deadlinePressure = Math.min(100, Math.round(input.highPriorityOpenRatio * 100));
  const alertVolumeRisk = Math.min(100, Math.round(input.alertCount * 14));
  const followUpBacklogRisk = Math.min(
    100,
    Math.round(input.followUpCount * 18 + input.overdueFollowUpCount * 25),
  );

  return {
    openCallsPressure,
    pipelineDepthRisk,
    applicationVelocityRisk,
    hiringVelocityRisk,
    coverageGapRisk,
    completionTrendRisk,
    deadlinePressure,
    alertVolumeRisk,
    followUpBacklogRisk,
  };
}

const FACTOR_WEIGHTS: Array<keyof PredictiveRiskFactors> = [
  "openCallsPressure",
  "pipelineDepthRisk",
  "applicationVelocityRisk",
  "hiringVelocityRisk",
  "coverageGapRisk",
  "completionTrendRisk",
  "deadlinePressure",
  "alertVolumeRisk",
  "followUpBacklogRisk",
];

const WEIGHT_VALUES = [0.12, 0.12, 0.1, 0.08, 0.18, 0.12, 0.1, 0.1, 0.08];

export function computeWeightedRiskScore(factors: PredictiveRiskFactors): number {
  let total = 0;
  for (let index = 0; index < FACTOR_WEIGHTS.length; index += 1) {
    total += factors[FACTOR_WEIGHTS[index]] * WEIGHT_VALUES[index];
  }
  return Math.max(0, Math.min(100, Math.round(total)));
}

export function detectRiskTrend(input: {
  applicantVelocityDelta: number;
  coveragePercent: number;
  riskScore: number;
}): "improving" | "stable" | "declining" {
  if (input.applicantVelocityDelta > 1 && input.coveragePercent >= 55 && input.riskScore < 60) {
    return "improving";
  }
  if (input.applicantVelocityDelta < -1 || input.riskScore >= 65 || input.coveragePercent < 45) {
    return "declining";
  }
  return "stable";
}
