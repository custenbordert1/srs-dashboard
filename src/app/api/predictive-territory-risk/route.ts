import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { buildAlertSnapshot } from "@/lib/alerts/build-alert-snapshot";
import { listExecutiveAlertFollowUps } from "@/lib/alerts/executive-alert-status-store";
import { assertBreezyConfigured } from "@/lib/breezy-route-log";
import { ExecutiveRouteTimer } from "@/lib/executive-routes/executive-route-profiling";
import { respondExecutiveIntelligenceRoute } from "@/lib/executive-routes/executive-intelligence-route";
import { buildPredictiveTerritoryRiskSnapshot } from "@/lib/predictive-territory-risk";
import type { PredictiveTerritoryRiskSnapshot } from "@/lib/predictive-territory-risk/types";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ROUTE = "/api/predictive-territory-risk";

function emptyRiskSnapshot(fetchedAt: string): PredictiveTerritoryRiskSnapshot {
  return {
    generatedAt: fetchedAt,
    executiveSummary: {
      totalCriticalTerritories: 0,
      totalHighRiskTerritories: 0,
      projectsAtRisk: 0,
      predictedCoverageGap: 0,
    },
    highestRiskTerritories: [],
    healthiestTerritories: [],
    forecasts: [],
    territories: [],
    projects: [],
    storeClusters: [],
  };
}

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["admin", "executive"],
    auditAction: "predictive_territory_risk_read",
  });
  if (isGuardFailure(guard)) return guard;
  const { session } = guard;

  const breezyCheck = await assertBreezyConfigured(ROUTE);
  if (!breezyCheck.ok) {
    return NextResponse.json({ ok: false, error: breezyCheck.error }, { status: breezyCheck.status });
  }

  const timer = new ExecutiveRouteTimer(ROUTE);
  return respondExecutiveIntelligenceRoute({
    route: ROUTE,
    session,
    request,
    timer,
    bundleOptions: { unscopedForAdmin: true, scopeRepsToTerritory: false },
    build: async ({ bundle, deferExpensive }) => {
      if (deferExpensive) {
        return {
          snapshot: emptyRiskSnapshot(bundle.fetchedAt),
          logExtras: { deferred: true, phase: "risk_engine" },
        };
      }
      const alertSnapshot = buildAlertSnapshot({ bundle });
      const followUps = await listExecutiveAlertFollowUps();
      const snapshot = buildPredictiveTerritoryRiskSnapshot({
        bundle,
        alerts: alertSnapshot.alerts,
        followUps,
      });
      return {
        snapshot,
        logExtras: {
          criticalTerritories: snapshot.executiveSummary.totalCriticalTerritories,
          highRiskTerritories: snapshot.executiveSummary.totalHighRiskTerritories,
          phase: "risk_engine",
        },
      };
    },
  });
}
