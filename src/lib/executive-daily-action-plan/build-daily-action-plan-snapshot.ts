import type { ExecutiveAlert } from "@/lib/alerts/alert-types";
import { buildAlertSnapshot } from "@/lib/alerts/build-alert-snapshot";
import type {
  ExecutiveAlertFollowUp,
  ExecutiveAlertStatus,
  ExecutiveAlertStatusOverlay,
} from "@/lib/alerts/executive-alert-status-types";
import {
  buildDailyActionExecutiveSummary,
  buildDailyActionPlanItem,
  groupDailyActionItems,
} from "@/lib/executive-daily-action-plan/group-daily-actions";
import type { DailyActionPlanSnapshot } from "@/lib/executive-daily-action-plan/types";
import { buildRecruitingAutopilotSnapshot } from "@/lib/recruiting-autopilot";
import {
  applyLearnedConfidenceToRecommendations,
} from "@/lib/recommendation-intelligence/confidence-adjustment";
import type { TrustFlag } from "@/lib/executive-trust-roi/types";
import type { RecruitingIntelligenceRouteBundle } from "@/lib/recruiting-intelligence/load-recruiting-intelligence-route-bundle";

export type BuildDailyActionPlanInput = {
  bundle: RecruitingIntelligenceRouteBundle;
  alerts?: ExecutiveAlert[];
  followUps?: ExecutiveAlertFollowUp[];
  statusOverlays?: ExecutiveAlertStatusOverlay[];
  referenceMs?: number;
  learnedRates?: Record<string, number>;
  trustByType?: Record<string, TrustFlag>;
};

function statusMapFromOverlays(
  overlays: ExecutiveAlertStatusOverlay[],
): Record<string, ExecutiveAlertStatus> {
  const map: Record<string, ExecutiveAlertStatus> = {};
  for (const overlay of overlays) {
    map[overlay.alertId] = overlay.status;
  }
  return map;
}

export function buildDailyActionPlanSnapshot(
  input: BuildDailyActionPlanInput,
): DailyActionPlanSnapshot {
  const { bundle } = input;
  const referenceMs = input.referenceMs ?? Date.parse(bundle.fetchedAt);
  const alerts = input.alerts ?? buildAlertSnapshot({ bundle }).alerts;
  const followUps = input.followUps ?? [];
  const overlays = input.statusOverlays ?? [];

  const autopilot = buildRecruitingAutopilotSnapshot({
    bundle,
    alerts,
    followUps,
  });

  const learnedRates = input.learnedRates ?? {};
  const applyConfidence = (rows: typeof autopilot.all) =>
    Object.keys(learnedRates).length > 0
      ? applyLearnedConfidenceToRecommendations(rows, learnedRates)
      : rows;

  const statusByAlertId = statusMapFromOverlays(overlays);

  const sourceRecommendations = applyConfidence(
    autopilot.executiveSummary.topActionsToday.length
      ? autopilot.executiveSummary.topActionsToday
      : autopilot.all.slice(0, 15),
  );

  const all = sourceRecommendations
    .map((recommendation) =>
      buildDailyActionPlanItem({
        recommendation,
        alerts,
        statusByAlertId,
        referenceMs,
      }),
    )
    .sort((a, b) => b.recommendation.prioritizationScore - a.recommendation.prioritizationScore);

  const topActionsToday = all.slice(0, 10);
  const grouped = groupDailyActionItems(all);
  const planDate = new Date(referenceMs).toISOString().slice(0, 10);

  return {
    generatedAt: bundle.fetchedAt,
    planDate,
    executiveSummary: buildDailyActionExecutiveSummary(all, topActionsToday),
    topActionsToday,
    ...grouped,
    all,
    trustByType: input.trustByType ?? {},
  };
}
