import { auditTerritoryAccess, guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { refreshSessionTerritories } from "@/lib/auth/session-territories";
import { listExecutiveAlertActionLogs, listExecutiveAlertFollowUps, listExecutiveAlertStatusOverlays } from "@/lib/alerts/executive-alert-status-store";
import { breezyFailureBody, breezyFailureHttpStatus } from "@/lib/breezy-http-status";
import { assertBreezyConfigured, logBreezyRouteResult, logBreezyRouteStart } from "@/lib/breezy-route-log";
import { buildDmOperatingSystemSnapshot } from "@/lib/dm-operating-system";
import { loadRecruitingIntelligenceRouteBundle } from "@/lib/recruiting-intelligence/load-recruiting-intelligence-route-bundle";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ROUTE = "/api/dm-operating-system";

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["dm", "admin", "executive"],
    requireTerritory: true,
    auditAction: "dm_operating_system_read",
  });
  if (isGuardFailure(guard)) return guard;
  const session = refreshSessionTerritories(guard.session);
  auditTerritoryAccess(session, ROUTE);

  await logBreezyRouteStart(ROUTE, session);
  const breezyCheck = await assertBreezyConfigured(ROUTE);
  if (!breezyCheck.ok) {
    return NextResponse.json({ ok: false, error: breezyCheck.error }, { status: breezyCheck.status });
  }

  const forceRefresh = new URL(request.url).searchParams.get("forceRefresh") === "1";
  const loaded = await loadRecruitingIntelligenceRouteBundle(session, {
    forceRefresh,
    unscopedForAdmin: false,
    scopeRepsToTerritory: true,
  });

  if (!loaded.ok) {
    const status = breezyFailureHttpStatus(loaded.failure.failure.error);
    logBreezyRouteResult(ROUTE, status, { role: session.role, breezyOk: false });
    return NextResponse.json(breezyFailureBody(loaded.failure.failure), { status });
  }

  const { bundle } = loaded;
  const followUps = await listExecutiveAlertFollowUps();
  const statusOverlays = await listExecutiveAlertStatusOverlays(session.userId);
  const actionLogs = await listExecutiveAlertActionLogs();
  const snapshot = buildDmOperatingSystemSnapshot({
    session,
    bundle,
    followUps,
    statusOverlays,
    actionLogs,
  });

  logBreezyRouteResult(ROUTE, 200, {
    role: session.role,
    breezyOk: true,
    dmName: snapshot.scope.dmName,
    actionQueueCount: snapshot.actionQueue.length,
    territoryStates: snapshot.scope.territoryStates,
  });

  return NextResponse.json({
    ok: true,
    snapshot,
    meta: {
      partialSync: bundle.candidatesResult.partial ?? false,
      refreshedAt: bundle.fetchedAt,
      intelligenceCache: bundle.intelligenceCache,
      scopedToTerritory: snapshot.scope.scopedToTerritory,
    },
  });
}
