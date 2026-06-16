import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { buildAlertSnapshot } from "@/lib/alerts/build-alert-snapshot";
import { listExecutiveAlertFollowUps } from "@/lib/alerts/executive-alert-status-store";
import { breezyFailureBody, breezyFailureHttpStatus } from "@/lib/breezy-http-status";
import { assertBreezyConfigured, logBreezyRouteResult, logBreezyRouteStart } from "@/lib/breezy-route-log";
import { buildPredictiveTerritoryRiskSnapshot } from "@/lib/predictive-territory-risk";
import { loadRecruitingIntelligenceRouteBundle } from "@/lib/recruiting-intelligence/load-recruiting-intelligence-route-bundle";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ROUTE = "/api/predictive-territory-risk";

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["admin", "executive"],
    auditAction: "predictive_territory_risk_read",
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

  const { bundle } = loaded;
  const alertSnapshot = buildAlertSnapshot({ bundle });
  const followUps = await listExecutiveAlertFollowUps();
  const snapshot = buildPredictiveTerritoryRiskSnapshot({
    bundle,
    alerts: alertSnapshot.alerts,
    followUps,
  });

  logBreezyRouteResult(ROUTE, 200, {
    role: session.role,
    breezyOk: true,
    criticalTerritories: snapshot.executiveSummary.totalCriticalTerritories,
    highRiskTerritories: snapshot.executiveSummary.totalHighRiskTerritories,
  });

  return NextResponse.json({
    ok: true,
    snapshot,
    meta: {
      partialSync: bundle.candidatesResult.partial ?? false,
      refreshedAt: bundle.fetchedAt,
      intelligenceCache: bundle.intelligenceCache,
    },
  });
}
