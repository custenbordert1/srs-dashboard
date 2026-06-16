import {
  computeOptimizationScore,
  confidenceFromInputs,
  horizonScale,
} from "@/lib/autonomous-recruiting-planner/optimization-ranking";
import type {
  PlannerHorizon,
  PlannerOutcomeMetrics,
  RecruitingPlan,
} from "@/lib/autonomous-recruiting-planner/types";
import type { RecruitingAutopilotSnapshot } from "@/lib/recruiting-autopilot/types";
import type { UnifiedRecruitingCommandCenterSnapshot } from "@/lib/unified-recruiting-command-center/types";
import type { WorkforceCapacityForecastSnapshot } from "@/lib/workforce-capacity-forecast/types";

const HORIZON_LABELS: Record<PlannerHorizon, string> = {
  "7d": "7-Day Sprint Plan",
  "14d": "14-Day Acceleration Plan",
  "30d": "30-Day Strategic Plan",
};

function forecastForHorizon(
  workforce: WorkforceCapacityForecastSnapshot,
  horizon: PlannerHorizon,
): { coverage: number; completion: number; hires: number; openCallReduction: number } {
  const companyForecast = workforce.coverageForecasts.find((row) => row.scope === "company");
  const point = companyForecast?.forecasts.find((row) => row.horizon === horizon);
  const hirePoint = workforce.hiringForecast.find((row) => row.horizon === horizon);
  return {
    coverage: point?.coveragePercent ?? workforce.coverageForecasts[0]?.currentCoveragePercent ?? 0,
    completion: point?.completionPercent ?? 0,
    hires: hirePoint?.expectedHires ?? 0,
    openCallReduction: point?.openCallReduction ?? 0,
  };
}

function buildKeyActions(
  horizon: PlannerHorizon,
  autopilot: RecruitingAutopilotSnapshot,
  workforce: WorkforceCapacityForecastSnapshot,
): string[] {
  const scale = horizonScale(horizon);
  const topAutopilot = autopilot.highestImpact.slice(0, Math.ceil(3 * scale));
  const balancing = workforce.resourceBalancing.slice(0, Math.ceil(2 * scale));
  const actions = [
    ...topAutopilot.map((rec) => rec.title),
    ...balancing.map((rec) => rec.title),
  ];
  return [...new Set(actions)].slice(0, 5);
}

export function buildRecruitingPlans(input: {
  commandCenter: UnifiedRecruitingCommandCenterSnapshot;
  workforce: WorkforceCapacityForecastSnapshot;
  autopilot: RecruitingAutopilotSnapshot;
  recoverableCandidates: number;
  pipelineDepth: number;
}): RecruitingPlan[] {
  const horizons: PlannerHorizon[] = ["7d", "14d", "30d"];
  const overloadedRecruiters = input.workforce.recruiterCapacity.filter(
    (row) => row.state === "overloaded" || row.state === "busy",
  ).length;
  const confidence = confidenceFromInputs({
    pipelineDepth: input.pipelineDepth,
    recoverableCandidates: input.recoverableCandidates,
    overloadedRecruiters,
    totalRecruiters: input.workforce.recruiterCapacity.length,
  });

  return horizons.map((horizon) => {
    const forecast = forecastForHorizon(input.workforce, horizon);
    const scale = horizonScale(horizon);
    const riskReduction = Math.round(
      input.autopilot.executiveSummary.expectedRiskReduction * scale +
        input.workforce.staffingRisks.length * 2 * scale,
    );
    const outcomes: PlannerOutcomeMetrics = {
      coveragePercent: Math.round(forecast.coverage + input.autopilot.executiveSummary.expectedAdditionalStoreCoverage * scale),
      completionPercent: Math.round(forecast.completion + 3 * scale),
      expectedHires: Math.round(forecast.hires + input.autopilot.executiveSummary.expectedAdditionalHires * scale),
      openCallsReduced: Math.round(forecast.openCallReduction + input.commandCenter.kpis.openCalls * 0.05 * scale),
      riskReduction,
      criticalTerritories: Math.max(
        0,
        input.commandCenter.kpis.criticalTerritories - Math.round(1 * scale),
      ),
    };

    const optimizationScore = computeOptimizationScore(outcomes);
    const headline =
      horizon === "7d"
        ? `Quick wins: +${outcomes.expectedHires} hires, ${outcomes.coveragePercent}% coverage`
        : horizon === "14d"
          ? `Mid-horizon: reduce open calls by ${outcomes.openCallsReduced}, ${outcomes.riskReduction}% risk reduction`
          : `Strategic: ${outcomes.coveragePercent}% coverage, ${outcomes.completionPercent}% completion`;

    return {
      id: `plan-${horizon}`,
      horizon,
      label: HORIZON_LABELS[horizon],
      optimizationScore,
      confidenceScore: confidence,
      outcomes,
      headline,
      keyActions: buildKeyActions(horizon, input.autopilot, input.workforce),
    };
  });
}
