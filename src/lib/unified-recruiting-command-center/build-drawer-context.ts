import type { ExecutiveAlert } from "@/lib/alerts/alert-types";
import { ACTION_LABELS } from "@/lib/alerts/executive-alert-labels";
import type {
  ExecutiveAlertActionLogEntry,
  ExecutiveAlertFollowUp,
} from "@/lib/alerts/executive-alert-status-types";
import type { DailyActionPlanItem } from "@/lib/executive-daily-action-plan/types";
import type { PredictiveTerritoryRiskRow } from "@/lib/predictive-territory-risk/types";
import type { AutopilotRecommendation } from "@/lib/recruiting-autopilot/types";
import type {
  CommandCenterDrawerContext,
  CommandCenterWorkQueueItem,
} from "@/lib/unified-recruiting-command-center/types";

function findTerritoryRiskRow(
  rows: PredictiveTerritoryRiskRow[],
  territory: string,
): PredictiveTerritoryRiskRow | undefined {
  const normalized = territory.toLowerCase();
  return rows.find(
    (row) =>
      row.dmName.toLowerCase() === normalized ||
      row.label.toLowerCase() === normalized ||
      row.states.some((state) => state.toLowerCase() === normalized),
  );
}

function riskFactorLabels(row: PredictiveTerritoryRiskRow): string[] {
  return Object.entries(row.factors)
    .filter(([, value]) => value >= 60)
    .map(([key, value]) => `${key.replace(/([A-Z])/g, " $1").trim()} ${value}`);
}

export function buildDrawerContextForQueueItem(input: {
  item: CommandCenterWorkQueueItem;
  alerts: ExecutiveAlert[];
  recommendations: AutopilotRecommendation[];
  dailyActions: DailyActionPlanItem[];
  followUps: ExecutiveAlertFollowUp[];
  actionLogs: ExecutiveAlertActionLogEntry[];
  territoryRows: PredictiveTerritoryRiskRow[];
}): CommandCenterDrawerContext {
  const {
    item,
    alerts,
    recommendations,
    dailyActions,
    followUps,
    actionLogs,
    territoryRows,
  } = input;

  const alert = item.sourceAlertId
    ? alerts.find((row) => row.id === item.sourceAlertId)
    : undefined;
  const recommendation = item.sourceRecommendationId
    ? recommendations.find((row) => row.id === item.sourceRecommendationId)
    : undefined;
  const dailyAction = item.sourceDailyActionId
    ? dailyActions.find((row) => row.id === item.sourceDailyActionId)
    : undefined;
  const followUp = item.sourceFollowUpId
    ? followUps.find((row) => row.id === item.sourceFollowUpId)
    : undefined;

  const alertId = item.sourceAlertId ?? alert?.id;
  const followUpHistory = alertId
    ? followUps.filter((row) => row.alertId === alertId)
    : followUp
      ? [followUp]
      : [];
  const itemActionLogs = alertId
    ? actionLogs.filter((row) => row.alertId === alertId)
    : [];

  const linkedCandidates = alert?.context?.linkedCandidates ?? [];
  const linkedStores = alert?.context?.storeName ? [alert.context.storeName] : [];
  const linkedProjects = alert?.context?.projectName
    ? [alert.context.projectName]
    : recommendation?.entityType === "project"
      ? [recommendation.entityLabel]
      : [];

  const territoryRow =
    findTerritoryRiskRow(territoryRows, item.territory) ??
    (recommendation?.dmName ? findTerritoryRiskRow(territoryRows, recommendation.dmName) : undefined);

  const recommendedNextAction =
    dailyAction?.navigation.label ??
    (alert ? ACTION_LABELS[alert.recommendedAction] : undefined) ??
    recommendation?.navigation.label ??
    followUp?.notes ??
    "Review territory risk and assign owner follow-up";

  return {
    queueItemId: item.id,
    title: item.title,
    type: item.type,
    priority: item.priority,
    territory: item.territory,
    owner: item.owner,
    status: item.status,
    impactLabel: item.impactLabel,
    recommendedNextAction,
    alert,
    recommendation,
    dailyAction,
    followUp,
    followUpHistory,
    actionLogs: itemActionLogs,
    linkedCandidates,
    linkedStores,
    linkedProjects,
    riskDetail: territoryRow
      ? {
          riskScore: territoryRow.riskScore,
          riskLevel: territoryRow.riskLevel,
          trend: territoryRow.trend,
          factors: riskFactorLabels(territoryRow),
          recommendations: territoryRow.recommendations.map((row) => row.label),
        }
      : recommendation
        ? {
            riskScore: recommendation.opportunity.currentRisk,
            riskLevel:
              recommendation.opportunity.currentRisk >= 75
                ? "critical"
                : recommendation.opportunity.currentRisk >= 55
                  ? "high"
                  : "moderate",
            trend: "stable",
            factors: recommendation.supportingMetrics.map(
              (metric) => `${metric.label}: ${metric.value}`,
            ),
            recommendations: [recommendation.title],
          }
        : undefined,
  };
}

export function buildDrawerContextsByQueueId(input: {
  workQueue: CommandCenterWorkQueueItem[];
  alerts: ExecutiveAlert[];
  recommendations: AutopilotRecommendation[];
  dailyActions: DailyActionPlanItem[];
  followUps: ExecutiveAlertFollowUp[];
  actionLogs: ExecutiveAlertActionLogEntry[];
  territoryRows: PredictiveTerritoryRiskRow[];
}): Record<string, CommandCenterDrawerContext> {
  const contexts: Record<string, CommandCenterDrawerContext> = {};
  for (const item of input.workQueue) {
    contexts[item.id] = buildDrawerContextForQueueItem({
      item,
      alerts: input.alerts,
      recommendations: input.recommendations,
      dailyActions: input.dailyActions,
      followUps: input.followUps,
      actionLogs: input.actionLogs,
      territoryRows: input.territoryRows,
    });
  }
  return contexts;
}
