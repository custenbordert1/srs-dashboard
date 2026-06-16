import type { ExecutiveAlert } from "@/lib/alerts/alert-types";
import type {
  ExecutiveAlertFollowUp,
  ExecutiveAlertStatus,
  ExecutiveAlertStatusOverlay,
} from "@/lib/alerts/executive-alert-status-types";
import type { DailyActionPlanItem } from "@/lib/executive-daily-action-plan/types";
import type { AutopilotRecommendation } from "@/lib/recruiting-autopilot/types";
import { sortWorkQueueItems } from "@/lib/unified-recruiting-command-center/compare-work-queue";
import type { CommandCenterWorkQueueItem } from "@/lib/unified-recruiting-command-center/types";

function severityToPriority(
  severity: ExecutiveAlert["severity"],
): CommandCenterWorkQueueItem["priority"] {
  if (severity === "critical") return "critical";
  if (severity === "high") return "high";
  if (severity === "medium") return "medium";
  return "low";
}

function isOverdue(dueDate: string, referenceMs: number): boolean {
  const due = Date.parse(dueDate);
  if (Number.isNaN(due)) return false;
  return due < referenceMs;
}

function statusFromOverlay(
  alertId: string,
  overlays: ExecutiveAlertStatusOverlay[],
): ExecutiveAlertStatus {
  return overlays.find((row) => row.alertId === alertId)?.status ?? "new";
}

function territoryFromAlert(alert: ExecutiveAlert): string {
  return (
    alert.context?.dmName ??
    alert.context?.territoryLabel ??
    alert.context?.state ??
    "Unassigned"
  );
}

function territoryFromRecommendation(recommendation: AutopilotRecommendation): string {
  return recommendation.dmName ?? recommendation.entityLabel;
}

export function buildAlertWorkQueueItem(
  alert: ExecutiveAlert,
  overlays: ExecutiveAlertStatusOverlay[],
  referenceMs: number,
): CommandCenterWorkQueueItem {
  const status = statusFromOverlay(alert.id, overlays);
  const dueDate = alert.createdAt;
  return {
    id: `alert:${alert.id}`,
    type: "alert",
    priority: severityToPriority(alert.severity),
    territory: territoryFromAlert(alert),
    owner: alert.context?.dmName ?? "Leadership",
    dueDate,
    status,
    impactScore: alert.impactScore,
    impactLabel: `Impact ${alert.impactScore}`,
    title: alert.title,
    subtitle: alert.description,
    isOverdue: status !== "resolved" && isOverdue(dueDate, referenceMs),
    sourceAlertId: alert.id,
  };
}

export function buildRecommendationWorkQueueItem(
  recommendation: AutopilotRecommendation,
  referenceMs: number,
): CommandCenterWorkQueueItem {
  const dueDate = new Date(referenceMs + 3 * 24 * 60 * 60 * 1000).toISOString();
  const priority: CommandCenterWorkQueueItem["priority"] =
    recommendation.prioritizationScore >= 75
      ? "critical"
      : recommendation.prioritizationScore >= 55
        ? "high"
        : recommendation.prioritizationScore >= 35
          ? "medium"
          : "low";

  return {
    id: `recommendation:${recommendation.id}`,
    type: "recommendation",
    priority,
    territory: territoryFromRecommendation(recommendation),
    owner: recommendation.dmName ?? "Operations",
    dueDate,
    status: "open",
    impactScore: recommendation.prioritizationScore,
    impactLabel: `ROI ${recommendation.opportunity.expectedRoiScore}`,
    title: recommendation.title,
    subtitle: recommendation.reasoning,
    isOverdue: false,
    sourceRecommendationId: recommendation.id,
  };
}

export function buildFollowUpWorkQueueItem(
  followUp: ExecutiveAlertFollowUp,
  alert: ExecutiveAlert | undefined,
  referenceMs: number,
): CommandCenterWorkQueueItem {
  const overdue = !followUp.completedAt && isOverdue(followUp.dueDate, referenceMs);
  return {
    id: `follow-up:${followUp.id}`,
    type: "follow-up",
    priority: followUp.priority,
    territory: alert ? territoryFromAlert(alert) : followUp.ownerName,
    owner: followUp.ownerName,
    dueDate: followUp.dueDate,
    status: followUp.completedAt ? "completed" : overdue ? "overdue" : "open",
    impactScore:
      followUp.priority === "critical"
        ? 90
        : followUp.priority === "high"
          ? 75
          : followUp.priority === "medium"
            ? 50
            : 30,
    impactLabel: `Follow-up · ${followUp.priority}`,
    title: alert?.title ?? `Follow-up for ${followUp.ownerName}`,
    subtitle: followUp.notes ?? "Assigned executive follow-up",
    isOverdue: overdue,
    sourceAlertId: followUp.alertId,
    sourceFollowUpId: followUp.id,
  };
}

export function buildDailyActionWorkQueueItem(
  item: DailyActionPlanItem,
  referenceMs: number,
): CommandCenterWorkQueueItem {
  const priority: CommandCenterWorkQueueItem["priority"] =
    item.bucket === "must-do-today"
      ? "critical"
      : item.bucket === "should-do-this-week"
        ? "high"
        : "medium";

  return {
    id: `daily-action:${item.id}`,
    type: "daily-action",
    priority,
    territory: item.owner,
    owner: item.owner,
    dueDate: item.dueDate,
    status: item.status,
    impactScore: item.expectedImpact,
    impactLabel: `Coverage +${item.expectedCoverageGain}%`,
    title: item.title,
    subtitle: item.reasoning,
    isOverdue: item.status !== "resolved" && isOverdue(item.dueDate, referenceMs),
    sourceAlertId: item.alertId,
    sourceRecommendationId: item.links.recommendationId,
    sourceDailyActionId: item.id,
  };
}

export function buildUnifiedWorkQueue(input: {
  alerts: ExecutiveAlert[];
  recommendations: AutopilotRecommendation[];
  followUps: ExecutiveAlertFollowUp[];
  dailyActions: DailyActionPlanItem[];
  statusOverlays: ExecutiveAlertStatusOverlay[];
  referenceMs: number;
}): CommandCenterWorkQueueItem[] {
  const alertById = new Map(input.alerts.map((alert) => [alert.id, alert]));
  const items: CommandCenterWorkQueueItem[] = [
    ...input.alerts.map((alert) =>
      buildAlertWorkQueueItem(alert, input.statusOverlays, input.referenceMs),
    ),
    ...input.recommendations.map((recommendation) =>
      buildRecommendationWorkQueueItem(recommendation, input.referenceMs),
    ),
    ...input.followUps
      .filter((followUp) => !followUp.completedAt)
      .map((followUp) =>
        buildFollowUpWorkQueueItem(
          followUp,
          alertById.get(followUp.alertId),
          input.referenceMs,
        ),
      ),
    ...input.dailyActions.map((item) =>
      buildDailyActionWorkQueueItem(item, input.referenceMs),
    ),
  ];

  return sortWorkQueueItems(items);
}
