import type { ExecutiveAlert } from "@/lib/alerts/alert-types";
import type { ExecutiveAlertStatus } from "@/lib/alerts/executive-alert-status-types";
import { DEFAULT_EXECUTIVE_ALERT_STATUS } from "@/lib/alerts/executive-alert-status-types";
import { dailyActionAlertId } from "@/lib/executive-daily-action-plan/daily-action-alert-id";
import type {
  DailyActionBucket,
  DailyActionPlanExecutiveSummary,
  DailyActionPlanItem,
} from "@/lib/executive-daily-action-plan/types";
import type { AutopilotRecommendation } from "@/lib/recruiting-autopilot/types";
import { AUTOPILOT_RECOMMENDATION_LABELS } from "@/lib/recruiting-autopilot/recommendation-labels";

export function classifyDailyActionBucket(recommendation: AutopilotRecommendation): DailyActionBucket {
  if (
    recommendation.prioritizationScore >= 72 ||
    (recommendation.horizon === "quick-win" && recommendation.impactScore >= 75) ||
    recommendation.opportunity.currentRisk >= 80
  ) {
    return "must-do-today";
  }
  if (
    recommendation.prioritizationScore >= 50 ||
    recommendation.horizon === "quick-win" ||
    recommendation.impactScore >= 60
  ) {
    return "should-do-this-week";
  }
  return "monitor-only";
}

function dueDateForBucket(bucket: DailyActionBucket, referenceMs: number): string {
  const date = new Date(referenceMs);
  if (bucket === "must-do-today") {
    date.setHours(23, 59, 59, 999);
    return date.toISOString().slice(0, 10);
  }
  if (bucket === "should-do-this-week") {
    date.setDate(date.getDate() + 7);
    return date.toISOString().slice(0, 10);
  }
  date.setDate(date.getDate() + 14);
  return date.toISOString().slice(0, 10);
}

function resolveOwner(recommendation: AutopilotRecommendation): {
  owner: string;
  ownerKind: DailyActionPlanItem["ownerKind"];
} {
  if (recommendation.entityType === "recruiter") {
    return { owner: recommendation.entityLabel, ownerKind: "recruiter" };
  }
  if (recommendation.dmName) {
    return { owner: recommendation.dmName, ownerKind: "dm" };
  }
  return { owner: "Recruiting Operations", ownerKind: "operations" };
}

function findRelatedAlert(
  recommendation: AutopilotRecommendation,
  alerts: ExecutiveAlert[],
): ExecutiveAlert | undefined {
  return alerts.find((alert) => {
    if (alert.id === recommendation.id) return true;
    if (
      recommendation.dmName &&
      (alert.context?.dmName === recommendation.dmName ||
        alert.context?.territoryLabel === recommendation.dmName)
    ) {
      return true;
    }
    if (
      recommendation.entityType === "project" &&
      alert.context?.opportunityId &&
      recommendation.entityId.includes(alert.context.opportunityId)
    ) {
      return true;
    }
    return false;
  });
}

export function buildDailyActionPlanItem(input: {
  recommendation: AutopilotRecommendation;
  alerts: ExecutiveAlert[];
  statusByAlertId: Record<string, ExecutiveAlertStatus>;
  referenceMs?: number;
}): DailyActionPlanItem {
  const { recommendation } = input;
  const bucket = classifyDailyActionBucket(recommendation);
  const { owner, ownerKind } = resolveOwner(recommendation);
  const relatedAlert = findRelatedAlert(recommendation, input.alerts);
  const alertId = dailyActionAlertId(recommendation.id);
  const referenceMs = input.referenceMs ?? Date.now();

  return {
    id: `daily-plan:${recommendation.id}`,
    alertId,
    bucket,
    title: AUTOPILOT_RECOMMENDATION_LABELS[recommendation.kind],
    owner,
    ownerKind,
    dueDate: dueDateForBucket(bucket, referenceMs),
    expectedImpact: recommendation.estimatedOutcomeImprovement,
    expectedCoverageGain: recommendation.opportunity.estimatedCoverageGain,
    expectedHireGain: Math.max(1, Math.round(recommendation.opportunity.estimatedCandidateGain * 0.22)),
    reasoning: recommendation.reasoning,
    links: {
      recommendationId: recommendation.id,
      recommendationKind: recommendation.kind,
      recommendationTitle: recommendation.entityLabel,
      riskScore: recommendation.opportunity.currentRisk,
      relatedAlertId: relatedAlert?.id,
      relatedAlertTitle: relatedAlert?.title,
    },
    navigation: recommendation.navigation,
    status: input.statusByAlertId[alertId] ?? DEFAULT_EXECUTIVE_ALERT_STATUS,
    recommendation,
  };
}

export function groupDailyActionItems(items: DailyActionPlanItem[]): {
  mustDoToday: DailyActionPlanItem[];
  shouldDoThisWeek: DailyActionPlanItem[];
  monitorOnly: DailyActionPlanItem[];
} {
  return {
    mustDoToday: items.filter((row) => row.bucket === "must-do-today"),
    shouldDoThisWeek: items.filter((row) => row.bucket === "should-do-this-week"),
    monitorOnly: items.filter((row) => row.bucket === "monitor-only"),
  };
}

export function computeDailyActionImpactTotals(
  items: DailyActionPlanItem[],
): Pick<
  DailyActionPlanExecutiveSummary,
  "projectedCoverageGain" | "projectedHireGain" | "riskReduction"
> {
  let projectedCoverageGain = 0;
  let projectedHireGain = 0;
  let riskReduction = 0;
  for (const item of items) {
    projectedCoverageGain += item.expectedCoverageGain;
    projectedHireGain += item.expectedHireGain;
    riskReduction += Math.round(item.expectedImpact * 0.25);
  }
  return {
    projectedCoverageGain,
    projectedHireGain,
    riskReduction: Math.min(100, riskReduction),
  };
}

export function buildDailyActionExecutiveSummary(
  items: DailyActionPlanItem[],
  topActionsToday: DailyActionPlanItem[],
): DailyActionPlanExecutiveSummary {
  const grouped = groupDailyActionItems(items);
  const impact = computeDailyActionImpactTotals(topActionsToday);
  return {
    criticalActionsToday: grouped.mustDoToday.length,
    ...impact,
    mustDoCount: grouped.mustDoToday.length,
    shouldDoCount: grouped.shouldDoThisWeek.length,
    monitorCount: grouped.monitorOnly.length,
  };
}
