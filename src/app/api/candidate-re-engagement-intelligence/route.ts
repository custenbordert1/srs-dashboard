import { auditTerritoryAccess, guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { refreshSessionTerritories } from "@/lib/auth/session-territories";
import { listExecutiveAlertActionLogs, listExecutiveAlertFollowUps, listExecutiveAlertStatusOverlays } from "@/lib/alerts/executive-alert-status-store";
import { breezyFailureBody, breezyFailureHttpStatus } from "@/lib/breezy-http-status";
import { assertBreezyConfigured, logBreezyRouteResult, logBreezyRouteStart } from "@/lib/breezy-route-log";
import { buildCandidateReEngagementIntelligenceSnapshot } from "@/lib/candidate-re-engagement-intelligence";
import { loadRecruitingIntelligenceRouteBundle } from "@/lib/recruiting-intelligence/load-recruiting-intelligence-route-bundle";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ROUTE = "/api/candidate-re-engagement-intelligence";

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["recruiter", "admin", "executive"],
    requireTerritory: true,
    auditAction: "candidate_re_engagement_intelligence_read",
  });
  if (isGuardFailure(guard)) return guard;
  const session = refreshSessionTerritories(guard.session);
  auditTerritoryAccess(session, ROUTE);

  await logBreezyRouteStart(ROUTE, session);
  const breezyCheck = await assertBreezyConfigured(ROUTE);
  if (!breezyCheck.ok) {
    return NextResponse.json({ ok: false, error: breezyCheck.error }, { status: breezyCheck.status });
  }

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
    const status = breezyFailureHttpStatus(loaded.failure.failure.error);
    logBreezyRouteResult(ROUTE, status, { role: session.role, breezyOk: false });
    return NextResponse.json(breezyFailureBody(loaded.failure.failure), { status });
  }

  const { bundle } = loaded;
  const followUps = await listExecutiveAlertFollowUps();
  const statusOverlays = await listExecutiveAlertStatusOverlays(session.userId);
  const actionLogs = await listExecutiveAlertActionLogs();
  const snapshot = buildCandidateReEngagementIntelligenceSnapshot({
    session,
    bundle,
    followUps,
    statusOverlays,
    actionLogs,
    requestedRecruiter,
  });

  logBreezyRouteResult(ROUTE, 200, {
    role: session.role,
    breezyOk: true,
    recoverableCandidates: snapshot.executiveSummary.recoverableCandidates,
    top25Count: snapshot.top25.length,
    scopedToRecruiter: snapshot.scope.scopedToRecruiter,
  });

  return NextResponse.json({
    ok: true,
    snapshot,
    meta: {
      partialSync: bundle.candidatesResult.partial ?? false,
      refreshedAt: bundle.fetchedAt,
      intelligenceCache: bundle.intelligenceCache,
      scopedToRecruiter: snapshot.scope.scopedToRecruiter,
    },
  });
}
