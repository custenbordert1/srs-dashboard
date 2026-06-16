import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { listExecutiveAlertFollowUps } from "@/lib/alerts/executive-alert-status-store";
import { assertBreezyConfigured } from "@/lib/breezy-route-log";
import { ExecutiveRouteTimer } from "@/lib/executive-routes/executive-route-profiling";
import { respondExecutiveIntelligenceRoute } from "@/lib/executive-routes/executive-intelligence-route";
import { buildRecommendationIntelligenceSnapshot } from "@/lib/recommendation-intelligence";
import { buildExecutiveTrustRoiSnapshot } from "@/lib/executive-trust-roi";
import type { RecommendationIntelligenceSnapshot } from "@/lib/recommendation-intelligence/types";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ROUTE = "/api/recommendation-intelligence";

function emptyRecommendationIntelligenceSnapshot(
  fetchedAt: string,
): RecommendationIntelligenceSnapshot {
  return {
    generatedAt: fetchedAt,
    planDate: fetchedAt.slice(0, 10),
    executiveSummary: {
      totalTracked: 0,
      inProgressCount: 0,
      completedCount: 0,
      ignoredCount: 0,
      overallSuccessRate: 0,
      topPerformingType: null,
      worstPerformingType: null,
      averageApplicantGain: 0,
    },
    topPerformingTypes: [],
    worstPerformingTypes: [],
    successRateByDm: [],
    successRateByRecruiter: [],
    successRateByProject: [],
    roiLeaderboard: [],
    effectivenessTrends: [],
    recentRecords: [],
    learnedConfidenceAdjustments: {},
    trustRoi: buildExecutiveTrustRoiSnapshot({ records: [], generatedAt: fetchedAt }),
  };
}

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["admin", "executive"],
    auditAction: "recommendation_intelligence_read",
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
          snapshot: emptyRecommendationIntelligenceSnapshot(bundle.fetchedAt),
          logExtras: { deferred: true, phase: "recommendation_intelligence" },
        };
      }
      const followUps = await listExecutiveAlertFollowUps();
      const snapshot = await buildRecommendationIntelligenceSnapshot({
        bundle,
        followUps,
      });
      return {
        snapshot,
        logExtras: {
          totalTracked: snapshot.executiveSummary.totalTracked,
          successRate: snapshot.executiveSummary.overallSuccessRate,
          phase: "recommendation_intelligence",
        },
      };
    },
  });
}
