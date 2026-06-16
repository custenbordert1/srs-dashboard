import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { buildExecutiveAlertAssigneeOptions } from "@/lib/alerts/build-executive-alert-assignees";
import { buildAlertSnapshot } from "@/lib/alerts/build-alert-snapshot";
import { mergeAlertStatuses } from "@/lib/alerts/executive-alert-filters";
import {
  listExecutiveAlertActionLogs,
  listExecutiveAlertFollowUps,
  listExecutiveAlertStatusOverlays,
} from "@/lib/alerts/executive-alert-status-store";
import { assertBreezyConfigured } from "@/lib/breezy-route-log";
import { ExecutiveRouteTimer } from "@/lib/executive-routes/executive-route-profiling";
import {
  loadExecutiveIntelligenceBundle,
  type ExecutiveIntelligenceRouteMeta,
} from "@/lib/executive-routes/executive-intelligence-route";
import { logBreezyRouteResult } from "@/lib/breezy-route-log";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ROUTE = "/api/executive-alerts";

function emptyAlertsMeta(generatedAt: string) {
  return {
    totalCount: 0,
    byCategory: {
      project: 0,
      territory: 0,
      recruiter: 0,
      placement: 0,
      candidate: 0,
      coverage: 0,
    },
    bySeverity: {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    },
    generatedAt,
  };
}

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["admin", "executive"],
    auditAction: "executive_alerts_read",
  });
  if (isGuardFailure(guard)) return guard;
  const { session } = guard;

  const breezyCheck = await assertBreezyConfigured(ROUTE);
  if (!breezyCheck.ok) {
    return NextResponse.json({ ok: false, error: breezyCheck.error }, { status: breezyCheck.status });
  }

  const timer = new ExecutiveRouteTimer(ROUTE);
  const bundleResult = await loadExecutiveIntelligenceBundle(
    request,
    session,
    ROUTE,
    timer,
    { unscopedForAdmin: true, scopeRepsToTerritory: false },
  );

  const { bundle, deferExpensive, servedFromCache, timedOut } = bundleResult;
  const snapshot = deferExpensive
    ? {
        alerts: [],
        topActions: [],
        topCritical: [],
        criticalAlerts: [],
        highAlerts: [],
        mediumAlerts: [],
        lowAlerts: [],
        meta: emptyAlertsMeta(bundle.fetchedAt),
        generatedAt: bundle.fetchedAt,
      }
    : buildAlertSnapshot({ bundle });

  const overlays = await listExecutiveAlertStatusOverlays(session.userId);
  const actionLogs = await listExecutiveAlertActionLogs();
  const followUps = await listExecutiveAlertFollowUps();
  const assigneeOptions = buildExecutiveAlertAssigneeOptions(bundle);
  const alerts = mergeAlertStatuses(snapshot.alerts, overlays);
  const withStatus = (rows: typeof snapshot.topCritical) =>
    mergeAlertStatuses(rows, overlays);

  timer.mark("executive_alerts_built", {
    candidateCount: bundle.candidates.length,
    details: { alertCount: snapshot.meta.totalCount, deferred: deferExpensive, timedOut },
  });

  const warnings: string[] = [];
  if (timedOut) warnings.push("Executive route deadline exceeded — partial snapshot returned.");
  if (!bundle.melOk) warnings.push("MEL projects data unavailable — coverage alerts may be incomplete.");
  if (bundle.candidatesResult.partial) warnings.push("Breezy candidate sync is partial.");

  const deferred =
    deferExpensive ||
    timedOut ||
    bundle.intelligenceCache.backgroundRefresh ||
    Boolean(bundle.candidatesResult.partial) ||
    !bundle.melOk;

  const meta: ExecutiveIntelligenceRouteMeta = {
    partialSync: bundle.candidatesResult.partial ?? false,
    refreshedAt: bundle.fetchedAt,
    intelligenceCache: bundle.intelligenceCache,
    deferred,
    servedFromCache,
    timedOut,
    melOk: bundle.melOk,
    warnings,
    timings: timer.toReport(deferred),
  };

  logBreezyRouteResult(ROUTE, 200, {
    role: session.role,
    breezyOk: true,
    deferred,
    timedOut,
    melOk: bundle.melOk,
    alertCount: snapshot.meta.totalCount,
    totalMs: timer.elapsedMs(),
  });

  return NextResponse.json({
    ok: true,
    alerts,
    topActions: withStatus(snapshot.topActions),
    topCritical: withStatus(snapshot.topCritical),
    criticalAlerts: withStatus(snapshot.criticalAlerts),
    highAlerts: withStatus(snapshot.highAlerts),
    mediumAlerts: withStatus(snapshot.mediumAlerts),
    lowAlerts: withStatus(snapshot.lowAlerts),
    statusOverlays: overlays,
    actionLogs,
    followUps,
    assigneeOptions,
    notesByAlertId: Object.fromEntries(
      overlays.filter((row) => row.note).map((row) => [row.alertId, row.note!]),
    ),
    meta: snapshot.meta,
    generatedAt: snapshot.generatedAt,
    intelligenceCache: bundle.intelligenceCache,
    routeMeta: meta,
  });
}
