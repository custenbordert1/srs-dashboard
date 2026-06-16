import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { buildExecutiveAlertAssigneeOptions } from "@/lib/alerts/build-executive-alert-assignees";
import { buildAlertSnapshot } from "@/lib/alerts/build-alert-snapshot";
import { mergeAlertStatuses } from "@/lib/alerts/executive-alert-filters";
import {
  listExecutiveAlertActionLogs,
  listExecutiveAlertFollowUps,
  listExecutiveAlertStatusOverlays,
} from "@/lib/alerts/executive-alert-status-store";
import { breezyFailureBody, breezyFailureHttpStatus } from "@/lib/breezy-http-status";
import { assertBreezyConfigured, logBreezyRouteResult, logBreezyRouteStart } from "@/lib/breezy-route-log";
import { loadRecruitingIntelligenceRouteBundle } from "@/lib/recruiting-intelligence/load-recruiting-intelligence-route-bundle";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ROUTE = "/api/executive-alerts";

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["admin", "executive"],
    auditAction: "executive_alerts_read",
  });
  if (isGuardFailure(guard)) return guard;
  const { session } = guard;

  await logBreezyRouteStart(ROUTE, session);
  const breezyCheck = await assertBreezyConfigured(ROUTE);
  if (!breezyCheck.ok) {
    return NextResponse.json({ ok: false, error: breezyCheck.error }, { status: breezyCheck.status });
  }

  const forceRefresh = new URL(request.url).searchParams.get("forceRefresh") === "1";
  const loaded = await loadRecruitingIntelligenceRouteBundle(session, {
    forceRefresh,
    unscopedForAdmin: true,
    scopeRepsToTerritory: false,
  });

  if (!loaded.ok) {
    const status = breezyFailureHttpStatus(loaded.failure.failure.error);
    logBreezyRouteResult(ROUTE, status, { role: session.role, breezyOk: false });
    return NextResponse.json(breezyFailureBody(loaded.failure.failure), { status });
  }

  const snapshot = buildAlertSnapshot({ bundle: loaded.bundle });
  const overlays = await listExecutiveAlertStatusOverlays(session.userId);
  const actionLogs = await listExecutiveAlertActionLogs();
  const followUps = await listExecutiveAlertFollowUps();
  const assigneeOptions = buildExecutiveAlertAssigneeOptions(loaded.bundle);
  const alerts = mergeAlertStatuses(snapshot.alerts, overlays);
  const withStatus = (rows: typeof snapshot.topCritical) =>
    mergeAlertStatuses(rows, overlays);

  logBreezyRouteResult(ROUTE, 200, {
    role: session.role,
    breezyOk: true,
    alertCount: snapshot.meta.totalCount,
    criticalCount: snapshot.meta.bySeverity.critical,
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
    intelligenceCache: loaded.bundle.intelligenceCache,
  });
}
