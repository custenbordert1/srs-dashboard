import type { PlannerOutcomeMetrics, RecruitingPlan } from "@/lib/autonomous-recruiting-planner/types";

const COVERAGE_WEIGHT = 0.35;
const HIRE_WEIGHT = 0.25;
const COMPLETION_WEIGHT = 0.2;
const RISK_WEIGHT = 0.12;
const OPEN_CALL_WEIGHT = 0.08;

export function computeOptimizationScore(outcomes: PlannerOutcomeMetrics): number {
  const coverageComponent = Math.min(100, outcomes.coveragePercent) * COVERAGE_WEIGHT;
  const hireComponent = Math.min(50, outcomes.expectedHires) * 2 * HIRE_WEIGHT;
  const completionComponent = Math.min(100, outcomes.completionPercent) * COMPLETION_WEIGHT;
  const riskComponent = Math.min(100, outcomes.riskReduction) * RISK_WEIGHT;
  const openCallComponent = Math.min(50, outcomes.openCallsReduced) * 2 * OPEN_CALL_WEIGHT;
  return Math.round(
    coverageComponent + hireComponent + completionComponent + riskComponent + openCallComponent,
  );
}

export function rankPlansByOptimization(plans: RecruitingPlan[]): RecruitingPlan[] {
  return [...plans].sort((a, b) => {
    if (b.optimizationScore !== a.optimizationScore) {
      return b.optimizationScore - a.optimizationScore;
    }
    return b.confidenceScore - a.confidenceScore;
  });
}

export function horizonScale(horizon: "7d" | "14d" | "30d"): number {
  if (horizon === "7d") return 0.35;
  if (horizon === "14d") return 0.65;
  return 1;
}

export function confidenceFromInputs(input: {
  pipelineDepth: number;
  recoverableCandidates: number;
  overloadedRecruiters: number;
  totalRecruiters: number;
}): number {
  const pipelineFactor = Math.min(40, input.pipelineDepth / 2);
  const recoveryFactor = Math.min(25, input.recoverableCandidates * 2);
  const capacityPenalty =
    input.totalRecruiters > 0
      ? Math.round((input.overloadedRecruiters / input.totalRecruiters) * 20)
      : 0;
  return Math.max(35, Math.min(95, 50 + pipelineFactor + recoveryFactor - capacityPenalty));
}
