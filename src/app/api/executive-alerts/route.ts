import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { buildAlertSnapshot } from "@/lib/alerts/build-alert-snapshot";
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

  logBreezyRouteResult(ROUTE, 200, {
    role: session.role,
    breezyOk: true,
    alertCount: snapshot.meta.totalCount,
    criticalCount: snapshot.meta.bySeverity.critical,
  });

  return NextResponse.json({
    ok: true,
    alerts: snapshot.alerts,
    topActions: snapshot.topActions,
    topCritical: snapshot.topCritical,
    criticalAlerts: snapshot.criticalAlerts,
    highAlerts: snapshot.highAlerts,
    mediumAlerts: snapshot.mediumAlerts,
    lowAlerts: snapshot.lowAlerts,
    meta: snapshot.meta,
    generatedAt: snapshot.generatedAt,
    intelligenceCache: loaded.bundle.intelligenceCache,
  });
}
