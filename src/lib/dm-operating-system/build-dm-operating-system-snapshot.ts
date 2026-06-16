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
import { buildUnifiedRecruitingCommandCenterSnapshot } from "@/lib/unified-recruiting-command-center";
import { buildDmActionQueue } from "@/lib/dm-operating-system/build-dm-action-queue";
import { buildDmDailyPlan } from "@/lib/dm-operating-system/build-dm-daily-plan";
import { buildDmEscalationCenter } from "@/lib/dm-operating-system/build-escalation-center";
import { buildDmOperatingSystemKpis } from "@/lib/dm-operating-system/build-dm-kpis";
import {
  filterAlertsForDmScope,
  filterFollowUpsForDmScope,
} from "@/lib/dm-operating-system/filter-territory-scope";
import { resolveDmOperatingSystemScope } from "@/lib/dm-operating-system/permissions";
import { buildRecruiterPerformance } from "@/lib/dm-operating-system/build-recruiter-performance";
import { buildTerritoryForecast } from "@/lib/dm-operating-system/build-territory-forecast";
import { buildTerritoryHeatMap } from "@/lib/dm-operating-system/build-territory-heatmap";
import type { DmOperatingSystemSnapshot } from "@/lib/dm-operating-system/types";
import type { AuthSession } from "@/lib/auth/types";

export type BuildDmOperatingSystemInput = {
  session: AuthSession;
  bundle: RecruitingIntelligenceRouteBundle;
  followUps?: ExecutiveAlertFollowUp[];
  statusOverlays?: ExecutiveAlertStatusOverlay[];
  actionLogs?: ExecutiveAlertActionLogEntry[];
  referenceMs?: number;
};

export function buildDmOperatingSystemSnapshot(
  input: BuildDmOperatingSystemInput,
): DmOperatingSystemSnapshot {
  const { session, bundle } = input;
  const referenceMs = input.referenceMs ?? Date.parse(bundle.fetchedAt);
  const followUps = input.followUps ?? [];
  const statusOverlays = input.statusOverlays ?? [];
  const actionLogs = input.actionLogs ?? [];
  const scope = resolveDmOperatingSystemScope(session);

  const commandCenter = buildUnifiedRecruitingCommandCenterSnapshot({
    bundle,
    followUps,
    statusOverlays,
    actionLogs,
    referenceMs,
  });

  const alertSnapshot = buildAlertSnapshot({ bundle });
  const alerts = mergeAlertStatuses(alertSnapshot.alerts, statusOverlays);
  const scopedAlerts = filterAlertsForDmScope(alerts, scope);
  const scopedFollowUps = filterFollowUpsForDmScope(followUps, scope);

  const riskSnapshot = buildPredictiveTerritoryRiskSnapshot({
    bundle,
    alerts: scopedAlerts,
    followUps: scopedFollowUps,
    referenceMs,
  });

  const autopilot = buildRecruitingAutopilotSnapshot({
    bundle,
    alerts: scopedAlerts,
    followUps: scopedFollowUps,
  });

  const dailyActionPlan = buildDailyActionPlanSnapshot({
    bundle,
    alerts: scopedAlerts,
    followUps: scopedFollowUps,
    statusOverlays,
    referenceMs,
  });

  const kpis = buildDmOperatingSystemKpis({ bundle, riskSnapshot, scope });
  const actionQueue = buildDmActionQueue({ workQueue: commandCenter.workQueue, scope });
  const heatMap = buildTerritoryHeatMap({
    storeClusters: riskSnapshot.storeClusters,
    projects: riskSnapshot.projects,
    scope,
  });
  const recruiterPerformance = buildRecruiterPerformance({
    bundle,
    followUps: scopedFollowUps,
    scope,
  });
  const forecast = buildTerritoryForecast({
    riskSnapshot,
    scope,
    baseCoveragePercent: kpis.territoryCoveragePercent,
    baseOpenCalls: kpis.openCalls,
  });
  const dailyPlan = buildDmDailyPlan({ dailyActionPlan, scope });
  const escalationCenter = buildDmEscalationCenter({
    recommendations: autopilot.all,
    alerts: scopedAlerts,
    actionQueue,
    scope,
  });

  const drawerContextsByQueueId: DmOperatingSystemSnapshot["drawerContextsByQueueId"] = {};
  for (const item of actionQueue) {
    const context = commandCenter.drawerContextsByQueueId[item.id];
    if (context) drawerContextsByQueueId[item.id] = context;
  }

  return {
    generatedAt: bundle.fetchedAt,
    planDate: commandCenter.planDate,
    scope,
    kpis,
    actionQueue,
    heatMap,
    recruiterPerformance,
    forecast,
    dailyPlan,
    escalationCenter,
    drawerContextsByQueueId,
  };
}
