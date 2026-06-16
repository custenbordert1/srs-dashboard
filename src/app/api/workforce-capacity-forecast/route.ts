import { auditTerritoryAccess, guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { refreshSessionTerritories } from "@/lib/auth/session-territories";
import {
  listExecutiveAlertActionLogs,
  listExecutiveAlertFollowUps,
  listExecutiveAlertStatusOverlays,
} from "@/lib/alerts/executive-alert-status-store";
import { assertBreezyConfigured } from "@/lib/breezy-route-log";
import { ExecutiveRouteTimer } from "@/lib/executive-routes/executive-route-profiling";
import { respondExecutiveIntelligenceRoute } from "@/lib/executive-routes/executive-intelligence-route";
import { buildWorkforceCapacityForecastSnapshot } from "@/lib/workforce-capacity-forecast";
import { resolveWorkforceCapacityForecastScope } from "@/lib/workforce-capacity-forecast/permissions";
import type { WorkforceCapacityForecastSnapshot } from "@/lib/workforce-capacity-forecast/types";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ROUTE = "/api/workforce-capacity-forecast";

function emptyWorkforceSnapshot(
  session: ReturnType<typeof refreshSessionTerritories>,
  fetchedAt: string,
  requestedRecruiter: string | null,
): WorkforceCapacityForecastSnapshot {
  const scope = resolveWorkforceCapacityForecastScope(session, requestedRecruiter);
  return {
    generatedAt: fetchedAt,
    planDate: fetchedAt.slice(0, 10),
    scope,
    recruiterCapacity: [],
    dmCapacity: [],
    hiringForecast: [],
    coverageForecasts: [],
    staffingRisks: [],
    capacityPlanning: {
      recruitersNeedingHelp: [],
      recruitersWithSpareCapacity: [],
      dmsAtRisk: [],
      projectsRequiringStaffingSupport: [],
    },
    resourceBalancing: [],
    executiveOutlook: {
      headline: "Serving cached intelligence — workforce forecast refreshes in background.",
      hiringForecast: [],
      capacitySummary: {
        overloadedRecruiters: 0,
        underutilizedRecruiters: 0,
        dmsAtRisk: 0,
        averageRecruiterCapacity: 0,
        averageDmCapacityScore: 0,
      },
      topRisks: [],
      recommendedActions: [],
    },
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

  const breezyCheck = await assertBreezyConfigured(ROUTE);
  if (!breezyCheck.ok) {
    return NextResponse.json({ ok: false, error: breezyCheck.error }, { status: breezyCheck.status });
  }

  const url = new URL(request.url);
  const requestedRecruiter = url.searchParams.get("recruiter")?.trim() || null;
  const unscopedForAdmin = session.role === "admin" || session.role === "executive";
  const timer = new ExecutiveRouteTimer(ROUTE);

  const response = await respondExecutiveIntelligenceRoute({
    route: ROUTE,
    session,
    request,
    timer,
    bundleOptions: {
      unscopedForAdmin,
      scopeRepsToTerritory: !unscopedForAdmin,
    },
    build: async ({ bundle, deferExpensive }) => {
      if (deferExpensive) {
        return {
          snapshot: emptyWorkforceSnapshot(session, bundle.fetchedAt, requestedRecruiter),
          logExtras: { deferred: true, phase: "workforce_forecast" },
        };
      }
      const followUps = await listExecutiveAlertFollowUps();
      const statusOverlays = await listExecutiveAlertStatusOverlays(session.userId);
      const actionLogs = await listExecutiveAlertActionLogs();
      const snapshot = buildWorkforceCapacityForecastSnapshot({
        session,
        bundle,
        followUps,
        statusOverlays,
        actionLogs,
        requestedRecruiter,
      });
      return {
        snapshot,
        logExtras: {
          recruiterCount: snapshot.recruiterCapacity.length,
          dmCount: snapshot.dmCapacity.length,
          riskCount: snapshot.staffingRisks.length,
          phase: "workforce_forecast",
        },
        responseExtras: {
          scopedToTerritory: snapshot.scope.scopedToTerritory,
          scopedToRecruiter: snapshot.scope.scopedToRecruiter,
          requestedRecruiter,
        },
      };
    },
  });

  return response;
}
