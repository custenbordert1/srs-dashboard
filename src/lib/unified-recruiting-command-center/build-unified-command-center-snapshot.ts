import { buildAlertSnapshot } from "@/lib/alerts/build-alert-snapshot";
import { mergeAlertStatuses } from "@/lib/alerts/executive-alert-filters";
import type {
  ExecutiveAlertActionLogEntry,
  ExecutiveAlertFollowUp,
  ExecutiveAlertStatusOverlay,
} from "@/lib/alerts/executive-alert-status-types";
import { buildDailyActionPlanSnapshot } from "@/lib/executive-daily-action-plan";
import { buildPredictiveTerritoryRiskSnapshot } from "@/lib/predictive-territory-risk";
import { buildRecruitingAutopilotSnapshot } from "@/lib/recruiting-autopilot";
import type { RecruitingIntelligenceRouteBundle } from "@/lib/recruiting-intelligence/load-recruiting-intelligence-route-bundle";
import { buildCommandCenterExecutiveBriefing } from "@/lib/unified-recruiting-command-center/build-executive-briefing";
import { buildDrawerContextsByQueueId } from "@/lib/unified-recruiting-command-center/build-drawer-context";
import { buildCommandCenterKpis } from "@/lib/unified-recruiting-command-center/build-kpis";
import { buildCommandCenterProductivityMetrics } from "@/lib/unified-recruiting-command-center/build-productivity-metrics";
import { buildUnifiedWorkQueue } from "@/lib/unified-recruiting-command-center/build-work-queue";
import type { UnifiedRecruitingCommandCenterSnapshot } from "@/lib/unified-recruiting-command-center/types";

export type BuildUnifiedRecruitingCommandCenterInput = {
  bundle: RecruitingIntelligenceRouteBundle;
  followUps?: ExecutiveAlertFollowUp[];
  statusOverlays?: ExecutiveAlertStatusOverlay[];
  actionLogs?: ExecutiveAlertActionLogEntry[];
  referenceMs?: number;
};

function isOverdueFollowUp(followUp: ExecutiveAlertFollowUp, referenceMs: number): boolean {
  if (followUp.completedAt) return false;
  const due = Date.parse(followUp.dueDate);
  return !Number.isNaN(due) && due < referenceMs;
}

export function buildUnifiedRecruitingCommandCenterSnapshot(
  input: BuildUnifiedRecruitingCommandCenterInput,
): UnifiedRecruitingCommandCenterSnapshot {
  const { bundle } = input;
  const referenceMs = input.referenceMs ?? Date.parse(bundle.fetchedAt);
  const followUps = input.followUps ?? [];
  const statusOverlays = input.statusOverlays ?? [];
  const actionLogs = input.actionLogs ?? [];

  const alertSnapshot = buildAlertSnapshot({ bundle });
  const alerts = mergeAlertStatuses(alertSnapshot.alerts, statusOverlays);
  const riskSnapshot = buildPredictiveTerritoryRiskSnapshot({
    bundle,
    alerts,
    followUps,
    referenceMs,
  });
  const autopilot = buildRecruitingAutopilotSnapshot({
    bundle,
    alerts,
    followUps,
  });
  const dailyActionPlan = buildDailyActionPlanSnapshot({
    bundle,
    alerts,
    followUps,
    statusOverlays,
    referenceMs,
  });

  const kpis = buildCommandCenterKpis({ bundle, riskSnapshot, dailyActionPlan });
  const criticalAlerts = mergeAlertStatuses(alertSnapshot.topCritical, statusOverlays).slice(0, 8);
  const overdueFollowUps = followUps.filter((followUp) =>
    isOverdueFollowUp(followUp, referenceMs),
  );

  const coverageForecasts = riskSnapshot.forecasts.filter(
    (forecast) =>
      forecast.kind === "dm-coverage-miss" || forecast.kind === "zero-pipeline-store",
  );
  const hiringForecasts = riskSnapshot.forecasts.filter(
    (forecast) => forecast.kind === "territory-miss-completion",
  );

  const workQueue = buildUnifiedWorkQueue({
    alerts: criticalAlerts,
    recommendations: autopilot.highestImpact.slice(0, 12),
    followUps,
    dailyActions: dailyActionPlan.topActionsToday,
    statusOverlays,
    referenceMs,
  });

  const resolvedDailyActions = dailyActionPlan.all.filter((item) => item.status === "resolved");

  const productivityMetrics = buildCommandCenterProductivityMetrics({
    statusOverlays,
    followUps,
    resolvedDailyActions,
    referenceMs,
  });

  const briefing = buildCommandCenterExecutiveBriefing({
    kpis,
    riskSnapshot,
    autopilot,
    dailyActionPlan,
    criticalAlerts,
    referenceMs,
  });

  const drawerContextsByQueueId = buildDrawerContextsByQueueId({
    workQueue,
    alerts,
    recommendations: autopilot.all,
    dailyActions: dailyActionPlan.all,
    followUps,
    actionLogs,
    territoryRows: riskSnapshot.territories,
  });

  return {
    generatedAt: bundle.fetchedAt,
    planDate: new Date(referenceMs).toISOString().slice(0, 10),
    kpis,
    leftColumn: {
      criticalAlerts,
      todaysActions: dailyActionPlan.topActionsToday,
      overdueFollowUps,
    },
    centerColumn: {
      territoryRiskDashboard: riskSnapshot.highestRiskTerritories.slice(0, 8),
      coverageForecasts: coverageForecasts.slice(0, 8),
      hiringForecasts: hiringForecasts.slice(0, 8),
    },
    rightColumn: {
      topRecommendations: autopilot.highestImpact.slice(0, 8),
      dmPerformanceWatchlist: riskSnapshot.highestRiskTerritories.slice(0, 6),
      projectsAtRisk: riskSnapshot.projects
        .filter((row) => row.riskLevel === "critical" || row.riskLevel === "high")
        .slice(0, 8),
    },
    workQueue,
    briefing,
    productivityMetrics,
    drawerContextsByQueueId,
  };
}
