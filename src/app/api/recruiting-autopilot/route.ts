import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { buildAlertSnapshot } from "@/lib/alerts/build-alert-snapshot";
import { listExecutiveAlertFollowUps } from "@/lib/alerts/executive-alert-status-store";
import { assertBreezyConfigured } from "@/lib/breezy-route-log";
import { ExecutiveRouteTimer } from "@/lib/executive-routes/executive-route-profiling";
import { respondExecutiveIntelligenceRoute } from "@/lib/executive-routes/executive-intelligence-route";
import { buildRecruitingAutopilotSnapshot } from "@/lib/recruiting-autopilot";
import type { RecruitingAutopilotSnapshot } from "@/lib/recruiting-autopilot/types";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ROUTE = "/api/recruiting-autopilot";

function emptyAutopilotSnapshot(fetchedAt: string): RecruitingAutopilotSnapshot {
  const emptySummary = {
    topActionsToday: [],
    expectedAdditionalCandidates: 0,
    expectedAdditionalHires: 0,
    expectedAdditionalStoreCoverage: 0,
    expectedRiskReduction: 0,
  };
  return {
    generatedAt: fetchedAt,
    executiveSummary: emptySummary,
    highestImpact: [],
    quickWins: [],
    longTerm: [],
    byTerritory: {},
    byProject: {},
    byDm: {},
    all: [],
  };
}

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["admin", "executive"],
    auditAction: "recruiting_autopilot_read",
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
          snapshot: emptyAutopilotSnapshot(bundle.fetchedAt),
          logExtras: { deferred: true, phase: "autopilot" },
        };
      }
      const alertSnapshot = buildAlertSnapshot({ bundle });
      const followUps = await listExecutiveAlertFollowUps();
      const snapshot = buildRecruitingAutopilotSnapshot({
        bundle,
        alerts: alertSnapshot.alerts,
        followUps,
      });
      return {
        snapshot,
        logExtras: {
          recommendationCount: snapshot.all.length,
          topActionCount: snapshot.executiveSummary.topActionsToday.length,
          phase: "autopilot",
        },
      };
    },
  });
}
