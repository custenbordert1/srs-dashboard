import { buildAlerts, type AlertBuildContext } from "@/lib/alerts/build-alerts";
import { enrichExecutiveAlerts } from "@/lib/alerts/enrich-executive-alerts";
import { buildPrioritizedAlertSnapshot } from "@/lib/alerts/alert-prioritizer";
import type { AlertSnapshot } from "@/lib/alerts/alert-types";
import { buildExecutiveOperationsCenterSnapshot } from "@/lib/executive-operations-center";
import { buildPlacementCommandCenterSnapshot } from "@/lib/placement-command-center/build-placement-command-center-snapshot";
import type { RecruitingIntelligenceRouteBundle } from "@/lib/recruiting-intelligence/load-recruiting-intelligence-route-bundle";
import {
  buildTerritoryActionCenterSnapshot,
  type TerritoryActionBuildContext,
} from "@/lib/territory-action-engine";
import { buildWorkforceOpsCenterSnapshot } from "@/lib/workforce-ops-center";

export type BuildAlertSnapshotInput = {
  bundle: RecruitingIntelligenceRouteBundle;
};

export function buildAlertSnapshot(input: BuildAlertSnapshotInput): AlertSnapshot {
  const { bundle } = input;

  const workforce = buildWorkforceOpsCenterSnapshot({
    jobs: bundle.jobs,
    candidates: bundle.candidates,
    workflows: bundle.workflows,
    fetchedAt: bundle.fetchedAt,
    coverage: bundle.coverage,
    opportunities: bundle.opportunities,
    activeReps: bundle.activeReps,
  });

  const actionContext: TerritoryActionBuildContext = {
    jobs: bundle.jobs,
    candidates: bundle.candidates,
    workflows: bundle.workflows,
    fetchedAt: bundle.fetchedAt,
    coverage: bundle.coverage,
    opportunities: bundle.opportunities,
    activeReps: bundle.activeReps,
    workforceQueue: workforce.operationsQueue,
  };

  const actionCenter = buildTerritoryActionCenterSnapshot(actionContext);
  const executive = buildExecutiveOperationsCenterSnapshot(actionContext);
  const placement = buildPlacementCommandCenterSnapshot({
    jobs: bundle.jobs,
    candidates: bundle.candidates,
    workflows: bundle.workflows,
    fetchedAt: bundle.fetchedAt,
    coverage: bundle.coverage,
    opportunities: bundle.opportunities,
    activeReps: bundle.activeReps,
  });

  const alertContext: AlertBuildContext = {
    fetchedAt: bundle.fetchedAt,
    coverage: bundle.coverage,
    candidates: bundle.candidates,
    workflows: bundle.workflows,
    executive,
    placement,
    actionCenter,
  };

  const alerts = enrichExecutiveAlerts({
    alerts: buildAlerts(alertContext),
    bundle,
    placement,
  });

  return buildPrioritizedAlertSnapshot(alerts, bundle.fetchedAt, {
    intelligenceCacheStatus: bundle.intelligenceCache.cacheStatus,
  });
}
