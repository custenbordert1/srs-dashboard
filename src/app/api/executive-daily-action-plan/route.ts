import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { buildAlertSnapshot } from "@/lib/alerts/build-alert-snapshot";
import { listExecutiveAlertFollowUps, listExecutiveAlertStatusOverlays } from "@/lib/alerts/executive-alert-status-store";
import { assertBreezyConfigured } from "@/lib/breezy-route-log";
import { ExecutiveRouteTimer } from "@/lib/executive-routes/executive-route-profiling";
import { respondExecutiveIntelligenceRoute } from "@/lib/executive-routes/executive-intelligence-route";
import { buildDailyActionPlanSnapshot } from "@/lib/executive-daily-action-plan";
import type { DailyActionPlanSnapshot } from "@/lib/executive-daily-action-plan/types";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ROUTE = "/api/executive-daily-action-plan";

function emptyDailyActionPlanSnapshot(fetchedAt: string): DailyActionPlanSnapshot {
  const planDate = fetchedAt.slice(0, 10);
  const emptySummary = {
    criticalActionsToday: 0,
    projectedCoverageGain: 0,
    projectedHireGain: 0,
    riskReduction: 0,
    mustDoCount: 0,
    shouldDoCount: 0,
    monitorCount: 0,
  };
  return {
    generatedAt: fetchedAt,
    planDate,
    executiveSummary: emptySummary,
    topActionsToday: [],
    mustDoToday: [],
    shouldDoThisWeek: [],
    monitorOnly: [],
    all: [],
  };
}

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["admin", "executive"],
    auditAction: "executive_daily_action_plan_read",
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
      const followUps = await listExecutiveAlertFollowUps();
      const statusOverlays = await listExecutiveAlertStatusOverlays(session.userId);
      if (deferExpensive) {
        return {
          snapshot: emptyDailyActionPlanSnapshot(bundle.fetchedAt),
          logExtras: { deferred: true, phase: "daily_action_plan" },
        };
      }
      const alertSnapshot = buildAlertSnapshot({ bundle });
      const snapshot = buildDailyActionPlanSnapshot({
        bundle,
        alerts: alertSnapshot.alerts,
        followUps,
        statusOverlays,
      });
      return {
        snapshot,
        logExtras: {
          mustDoCount: snapshot.executiveSummary.mustDoCount,
          topActionCount: snapshot.topActionsToday.length,
          phase: "daily_action_plan",
        },
      };
    },
  });
}
