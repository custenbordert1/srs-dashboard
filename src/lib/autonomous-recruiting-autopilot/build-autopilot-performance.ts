import type { AutonomousRecruitingSnapshot } from "@/lib/autonomous-recruiting-engine/types";
import type { RecruitingExecutionSnapshot } from "@/lib/autonomous-recruiting-execution";
import type { PipelineIntelligenceSnapshot } from "@/lib/pipeline-intelligence/types";
import type { AutopilotPerformanceMetrics } from "@/lib/autonomous-recruiting-autopilot/types";

function averageTimeToFill(
  applicantPerformance: RecruitingExecutionSnapshot["applicantPerformance"],
): number | null {
  const values = applicantPerformance
    .map((row) => row.timeToFillDays)
    .filter((value): value is number => value !== null);
  if (values.length === 0) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

function pipelineConversion(pipeline?: PipelineIntelligenceSnapshot): number | null {
  if (!pipeline) return null;
  const appliedToMel = pipeline.funnelTransitions.find((row) => row.id === "applied-mel");
  return appliedToMel?.conversionPct ?? null;
}

function hiringSuccessRate(snapshot: AutonomousRecruitingSnapshot): number {
  const actionable = snapshot.hiringRecommendations.filter(
    (row) => row.recommendedAction !== "Reject" && row.recommendedAction !== "Hold",
  );
  const hireNow = snapshot.hiringRecommendations.filter((row) => row.recommendedAction === "Hire Now");
  if (actionable.length === 0) return 0;
  return Math.round((hireNow.length / actionable.length) * 100);
}

export function buildAutopilotPerformance(input: {
  autopilotSnapshot: AutonomousRecruitingSnapshot;
  executionSnapshot: RecruitingExecutionSnapshot;
  pipelineSnapshot?: PipelineIntelligenceSnapshot;
  priorCriticalTerritories?: number;
}): AutopilotPerformanceMetrics {
  const queue = input.executionSnapshot.executionQueue;
  const outcomes = input.executionSnapshot.outcomes;
  const postingSuccess = outcomes.find((row) => row.id === "posting-success-rate");
  const applicantConversion = outcomes.find((row) => row.id === "applicant-conversion");
  const coverageRisk = outcomes.find((row) => row.id === "coverage-risk-reduction");

  const recommendationsApproved = queue.filter((row) =>
    ["approved", "executing", "completed"].includes(row.status),
  ).length;
  const recommendationsExecuted = queue.filter((row) =>
    ["executing", "completed"].includes(row.status),
  ).length;

  const currentCritical = input.autopilotSnapshot.coverageNeeds.filter(
    (row) => row.coverageStatus === "Critical",
  ).length;
  const priorCritical = input.priorCriticalTerritories ?? currentCritical;

  return {
    recommendationsGenerated: queue.length,
    recommendationsApproved,
    recommendationsExecuted,
    postingSuccessRate: typeof postingSuccess?.value === "number" ? postingSuccess.value : 0,
    applicantConversionRate:
      typeof applicantConversion?.value === "number" ? applicantConversion.value : 0,
    timeToFillDays: averageTimeToFill(input.executionSnapshot.applicantPerformance),
    coverageRiskReduction: typeof coverageRisk?.value === "number" ? coverageRisk.value : 0,
    hiringSuccessRate: hiringSuccessRate(input.autopilotSnapshot),
    pipelineConversionPct: pipelineConversion(input.pipelineSnapshot),
    territoriesAtRisk: currentCritical,
  };
}
