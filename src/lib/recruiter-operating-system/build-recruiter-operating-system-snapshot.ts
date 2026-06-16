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
import { buildCandidatePriorities } from "@/lib/recruiter-operating-system/build-candidate-ranking";
import { buildPipelineHealth } from "@/lib/recruiter-operating-system/build-pipeline-health";
import { buildReEngagementCenter } from "@/lib/recruiter-operating-system/build-re-engagement-center";
import { buildRecruiterActionQueue } from "@/lib/recruiter-operating-system/build-recruiter-action-queue";
import { buildRecruiterDailyPlan } from "@/lib/recruiter-operating-system/build-recruiter-daily-plan";
import { buildRecruiterOperatingSystemKpis } from "@/lib/recruiter-operating-system/build-recruiter-kpis";
import { buildRecruiterProductivityMetrics } from "@/lib/recruiter-operating-system/build-productivity-metrics";
import { buildRecruiterRecommendations } from "@/lib/recruiter-operating-system/build-recruiter-recommendations";
import {
  filterAlertsForRecruiterScope,
  filterFollowUpsForRecruiterScope,
} from "@/lib/recruiter-operating-system/filter-recruiter-scope";
import { resolveRecruiterOperatingSystemScope } from "@/lib/recruiter-operating-system/permissions";
import type { RecruiterOperatingSystemSnapshot } from "@/lib/recruiter-operating-system/types";
import type { AuthSession } from "@/lib/auth/types";

export type BuildRecruiterOperatingSystemInput = {
  session: AuthSession;
  bundle: RecruitingIntelligenceRouteBundle;
  followUps?: ExecutiveAlertFollowUp[];
  statusOverlays?: ExecutiveAlertStatusOverlay[];
  actionLogs?: ExecutiveAlertActionLogEntry[];
  requestedRecruiter?: string | null;
  referenceMs?: number;
};

export function buildRecruiterOperatingSystemSnapshot(
  input: BuildRecruiterOperatingSystemInput,
): RecruiterOperatingSystemSnapshot {
  const { session, bundle } = input;
  const referenceMs = input.referenceMs ?? Date.parse(bundle.fetchedAt);
  const followUps = input.followUps ?? [];
  const statusOverlays = input.statusOverlays ?? [];
  const actionLogs = input.actionLogs ?? [];
  const scope = resolveRecruiterOperatingSystemScope(session, input.requestedRecruiter);

  const commandCenter = buildUnifiedRecruitingCommandCenterSnapshot({
    bundle,
    followUps,
    statusOverlays,
    actionLogs,
    referenceMs,
  });

  const alertSnapshot = buildAlertSnapshot({ bundle });
  const alerts = mergeAlertStatuses(alertSnapshot.alerts, statusOverlays);
  const scopedAlerts = filterAlertsForRecruiterScope(alerts, scope);
  const scopedFollowUps = filterFollowUpsForRecruiterScope(followUps, scope);

  buildPredictiveTerritoryRiskSnapshot({
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

  const candidatePriorities = buildCandidatePriorities({ bundle, scope, referenceMs });
  const kpis = buildRecruiterOperatingSystemKpis({ bundle, scope, referenceMs });
  const actionQueue = buildRecruiterActionQueue({
    bundle,
    workQueue: commandCenter.workQueue,
    scope,
    referenceMs,
  });
  const dailyPlan = buildRecruiterDailyPlan({
    bundle,
    dailyActionPlan,
    scope,
    referenceMs,
  });
  const reEngagementCenter = buildReEngagementCenter({ bundle, scope, referenceMs });
  const pipelineHealth = buildPipelineHealth({ bundle, scope, referenceMs });
  const productivityMetrics = buildRecruiterProductivityMetrics({ bundle, scope, referenceMs });
  const recommendations = buildRecruiterRecommendations({
    recommendations: autopilot.all,
    scope,
    candidatePriorities,
  });

  const drawerContextsByQueueId: RecruiterOperatingSystemSnapshot["drawerContextsByQueueId"] = {};
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
    candidatePriorities,
    dailyPlan,
    reEngagementCenter,
    pipelineHealth,
    productivityMetrics,
    recommendations,
    drawerContextsByQueueId,
  };
}
