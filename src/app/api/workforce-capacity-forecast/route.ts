import { auditTerritoryAccess, guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { refreshSessionTerritories } from "@/lib/auth/session-territories";
import {
  listExecutiveAlertActionLogs,
  listExecutiveAlertFollowUps,
  listExecutiveAlertStatusOverlays,
} from "@/lib/alerts/executive-alert-status-store";
import { breezyFailureBody, breezyFailureHttpStatus } from "@/lib/breezy-http-status";
import {
  assertBreezyConfigured,
  logBreezyRouteResult,
  logBreezyRouteStart,
} from "@/lib/breezy-route-log";
import { buildWorkforceCapacityForecastSnapshot } from "@/lib/workforce-capacity-forecast";
import { loadRecruitingIntelligenceRouteBundle } from "@/lib/recruiting-intelligence/load-recruiting-intelligence-route-bundle";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ROUTE = "/api/workforce-capacity-forecast";

async function loadSnapshotContext(
  session: ReturnType<typeof refreshSessionTerritories>,
  request: Request,
) {
  const url = new URL(request.url);
  const forceRefresh = url.searchParams.get("forceRefresh") === "1";
  const requestedRecruiter = url.searchParams.get("recruiter")?.trim() || null;

  const unscopedForAdmin = session.role === "admin" || session.role === "executive";

  const loaded = await loadRecruitingIntelligenceRouteBundle(session, {
    forceRefresh,
    unscopedForAdmin,
    scopeRepsToTerritory: !unscopedForAdmin,
  });

  if (!loaded.ok) {
    return { ok: false as const, failure: loaded.failure };
  }

  const followUps = await listExecutiveAlertFollowUps();
  const statusOverlays = await listExecutiveAlertStatusOverlays(session.userId);
  const actionLogs = await listExecutiveAlertActionLogs();
  const snapshot = buildWorkforceCapacityForecastSnapshot({
    session,
    bundle: loaded.bundle,
    followUps,
    statusOverlays,
    actionLogs,
    requestedRecruiter,
  });

  return {
    ok: true as const,
    bundle: loaded.bundle,
    snapshot,
    requestedRecruiter,
  };
}

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "admin", "dm", "recruiter"],
    requireTerritory: true,
    auditAction: "workforce_capacity_forecast_read",
  });
  if (isGuardFailure(guard)) return guard;
  const session = refreshSessionTerritories(guard.session);
  auditTerritoryAccess(session, ROUTE);

  await logBreezyRouteStart(ROUTE, session);
  const breezyCheck = await assertBreezyConfigured(ROUTE);
  if (!breezyCheck.ok) {
    return NextResponse.json({ ok: false, error: breezyCheck.error }, { status: breezyCheck.status });
  }

  const result = await loadSnapshotContext(session, request);
  if (!result.ok) {
    const status = breezyFailureHttpStatus(result.failure.failure.error);
    logBreezyRouteResult(ROUTE, status, { role: session.role, breezyOk: false });
    return NextResponse.json(breezyFailureBody(result.failure.failure), { status });
  }

  logBreezyRouteResult(ROUTE, 200, {
    role: session.role,
    breezyOk: true,
    recruiterCount: result.snapshot.recruiterCapacity.length,
    dmCount: result.snapshot.dmCapacity.length,
    riskCount: result.snapshot.staffingRisks.length,
    scopedToTerritory: result.snapshot.scope.scopedToTerritory,
  });

  return NextResponse.json({
    ok: true,
    snapshot: result.snapshot,
    meta: {
      partialSync: result.bundle.candidatesResult.partial ?? false,
      refreshedAt: result.bundle.fetchedAt,
      intelligenceCache: result.bundle.intelligenceCache,
      scopedToTerritory: result.snapshot.scope.scopedToTerritory,
      scopedToRecruiter: result.snapshot.scope.scopedToRecruiter,
      requestedRecruiter: result.requestedRecruiter,
    },
  });
}
