import type { AutonomousRecruitingSnapshot } from "@/lib/autonomous-recruiting-engine/types";
import type { RecruitingExecutionSnapshot } from "@/lib/autonomous-recruiting-execution";
import type { PipelineIntelligenceSnapshot } from "@/lib/pipeline-intelligence/types";
import { loadAutopilotPolicy, listAutopilotRuns } from "@/lib/autonomous-recruiting-autopilot/autopilot-policy-store";
import { buildAutopilotPerformance } from "@/lib/autonomous-recruiting-autopilot/build-autopilot-performance";
import { buildRecommendationFeedback } from "@/lib/autonomous-recruiting-autopilot/build-recommendation-feedback";
import type { AutopilotDashboardSnapshot } from "@/lib/autonomous-recruiting-autopilot/types";

function isToday(iso: string): boolean {
  const date = new Date(iso);
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

export async function buildAutopilotDashboardSnapshot(input: {
  autopilotSnapshot: AutonomousRecruitingSnapshot;
  executionSnapshot: RecruitingExecutionSnapshot;
  pipelineSnapshot?: PipelineIntelligenceSnapshot;
  priorCriticalTerritories?: number;
}): Promise<AutopilotDashboardSnapshot> {
  const [policy, recentRuns] = await Promise.all([loadAutopilotPolicy(), listAutopilotRuns(10)]);

  const performance = buildAutopilotPerformance({
    autopilotSnapshot: input.autopilotSnapshot,
    executionSnapshot: input.executionSnapshot,
    pipelineSnapshot: input.pipelineSnapshot,
    priorCriticalTerritories: input.priorCriticalTerritories,
  });

  const feedback = buildRecommendationFeedback({
    correlations: input.executionSnapshot.executionQueue,
    applicantPerformance: input.executionSnapshot.applicantPerformance,
    pipelineSnapshot: input.pipelineSnapshot,
    fetchedAt: input.autopilotSnapshot.fetchedAt,
  });

  const autoApprovedToday = recentRuns
    .filter((run) => isToday(run.completedAt))
    .reduce((sum, run) => sum + run.autoApproved, 0);
  const executedToday = recentRuns
    .filter((run) => isToday(run.completedAt))
    .reduce((sum, run) => sum + run.executed, 0);

  const awaitingApproval = input.executionSnapshot.executionQueue.filter((row) =>
    ["detected", "recommended"].includes(row.status),
  ).length;

  const currentCritical = input.autopilotSnapshot.coverageNeeds.filter(
    (row) => row.coverageStatus === "Critical",
  ).length;
  const priorCritical = input.priorCriticalTerritories ?? currentCritical;
  const territoriesImproved = Math.max(0, priorCritical - currentCritical);

  const status: AutopilotDashboardSnapshot["status"] = policy.paused
    ? "paused"
    : policy.mode === "manual"
      ? "manual"
      : "active";

  return {
    fetchedAt: input.autopilotSnapshot.fetchedAt,
    policy,
    status,
    autoApprovedToday,
    executedToday,
    coverageRiskReduced: performance.coverageRiskReduction,
    territoriesImproved,
    awaitingApproval,
    performance,
    feedback,
    recentRuns,
    topPerforming: feedback.topPerforming,
    lowestPerforming: feedback.lowestPerforming,
  };
}
