import type {
  ExecutiveAlertFollowUp,
  ExecutiveAlertStatusOverlay,
} from "@/lib/alerts/executive-alert-status-types";
import type { DailyActionPlanItem } from "@/lib/executive-daily-action-plan/types";
import type { CommandCenterProductivityMetrics } from "@/lib/unified-recruiting-command-center/types";

function isSameDay(iso: string, referenceMs: number): boolean {
  const date = new Date(iso);
  const reference = new Date(referenceMs);
  return (
    date.getUTCFullYear() === reference.getUTCFullYear() &&
    date.getUTCMonth() === reference.getUTCMonth() &&
    date.getUTCDate() === reference.getUTCDate()
  );
}

export function buildCommandCenterProductivityMetrics(input: {
  statusOverlays: ExecutiveAlertStatusOverlay[];
  followUps: ExecutiveAlertFollowUp[];
  resolvedDailyActions: DailyActionPlanItem[];
  referenceMs: number;
}): CommandCenterProductivityMetrics {
  const { statusOverlays, followUps, resolvedDailyActions, referenceMs } = input;

  const actionsCompletedToday = statusOverlays.filter(
    (overlay) =>
      overlay.status === "resolved" && isSameDay(overlay.updatedAt, referenceMs),
  ).length;

  const followUpsResolved = followUps.filter(
    (followUp) => followUp.completedAt && isSameDay(followUp.completedAt, referenceMs),
  ).length;

  const riskReductionAchieved = resolvedDailyActions.reduce(
    (sum, item) => sum + item.expectedImpact,
    0,
  );
  const coverageGained = resolvedDailyActions.reduce(
    (sum, item) => sum + item.expectedCoverageGain,
    0,
  );
  const hiresInfluenced = resolvedDailyActions.reduce(
    (sum, item) => sum + item.expectedHireGain,
    0,
  );

  return {
    actionsCompletedToday,
    followUpsResolved,
    riskReductionAchieved,
    coverageGained,
    hiresInfluenced,
  };
}
