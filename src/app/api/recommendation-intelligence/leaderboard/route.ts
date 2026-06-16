import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { listExecutiveAlertFollowUps } from "@/lib/alerts/executive-alert-status-store";
import { assertBreezyConfigured } from "@/lib/breezy-route-log";
import { ExecutiveRouteTimer } from "@/lib/executive-routes/executive-route-profiling";
import { respondExecutiveIntelligenceRoute } from "@/lib/executive-routes/executive-intelligence-route";
import {
  buildRecommendationIntelligenceSnapshot,
  buildRecommendationLeaderboardSnapshot,
  listRecommendationRecords,
} from "@/lib/recommendation-intelligence";
import type { RecommendationLeaderboardSnapshot } from "@/lib/recommendation-intelligence/types";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ROUTE = "/api/recommendation-intelligence/leaderboard";

function emptyLeaderboardSnapshot(fetchedAt: string): RecommendationLeaderboardSnapshot {
  return {
    generatedAt: fetchedAt,
    roiLeaderboard: [],
    topPerformingTypes: [],
    worstPerformingTypes: [],
  };
}

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["admin", "executive"],
    auditAction: "recommendation_intelligence_leaderboard_read",
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
          snapshot: emptyLeaderboardSnapshot(bundle.fetchedAt),
          logExtras: { deferred: true, phase: "recommendation_leaderboard" },
        };
      }
      const followUps = await listExecutiveAlertFollowUps();
      await buildRecommendationIntelligenceSnapshot({
        bundle,
        followUps,
      });
      const allRecords = await listRecommendationRecords();
      const snapshot = buildRecommendationLeaderboardSnapshot({
        generatedAt: bundle.fetchedAt,
        records: allRecords,
      });
      return {
        snapshot,
        logExtras: {
          leaderboardCount: snapshot.roiLeaderboard.length,
          phase: "recommendation_leaderboard",
        },
      };
    },
  });
}
