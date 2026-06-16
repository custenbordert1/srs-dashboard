import { countHiresLast7Days } from "@/lib/territory-intelligence/territory-intelligence-metrics";
import type { HiringForecastHorizon, HiringForecastPoint } from "@/lib/workforce-capacity-forecast/types";
import type { RecruitingIntelligenceRouteBundle } from "@/lib/recruiting-intelligence/load-recruiting-intelligence-route-bundle";

const HORIZON_DAYS: Record<HiringForecastHorizon, number> = {
  "7d": 7,
  "14d": 14,
  "30d": 30,
  "60d": 60,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function pipelineReadyCount(bundle: RecruitingIntelligenceRouteBundle): number {
  const readyStatuses = new Set([
    "Paperwork Sent",
    "Signed",
    "Ready for MEL",
    "Active Rep",
    "Qualified",
  ]);
  let count = 0;
  for (const candidate of bundle.candidates) {
    const record = bundle.workflows[candidate.candidateId];
    if (record && readyStatuses.has(record.workflowStatus)) count += 1;
  }
  return count;
}

export function buildHiringForecastPoints(input: {
  bundle: RecruitingIntelligenceRouteBundle;
  hiringVelocity?: number;
  pipelineDepth?: number;
}): HiringForecastPoint[] {
  const weeklyVelocity =
    input.hiringVelocity ?? countHiresLast7Days(input.bundle.candidates, input.bundle.fetchedAt);
  const pipelineDepth = input.pipelineDepth ?? pipelineReadyCount(input.bundle);
  const dailyVelocity = weeklyVelocity / 7;

  return (Object.keys(HORIZON_DAYS) as HiringForecastHorizon[]).map((horizon) => {
    const days = HORIZON_DAYS[horizon];
    const horizonFactor = days / 7;
    const pipelineContribution = Math.round(pipelineDepth * 0.12 * horizonFactor);
    const velocityHires = Math.round(dailyVelocity * days * 0.85);
    const expectedHires = Math.max(0, velocityHires + pipelineContribution);

    const dataConfidence = clamp(55 + weeklyVelocity * 4 + Math.min(pipelineDepth, 20), 40, 92);
    const horizonPenalty = Math.round(days * 0.35);
    const confidenceScore = clamp(dataConfidence - horizonPenalty, 30, 95);
    const spread = Math.max(1, Math.round((100 - confidenceScore) * 0.22 + days * 0.08));

    return {
      horizon,
      expectedHires,
      confidenceLow: Math.max(0, expectedHires - spread),
      confidenceHigh: expectedHires + spread + Math.round(pipelineDepth * 0.05),
      confidenceScore,
    };
  });
}
