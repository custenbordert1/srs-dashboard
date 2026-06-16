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
import { buildCandidateReEngagementIntelligenceSnapshot } from "@/lib/candidate-re-engagement-intelligence";
import { resolveRecruiterOperatingSystemScope } from "@/lib/recruiter-operating-system/permissions";
import type { CandidateReEngagementIntelligenceSnapshot } from "@/lib/candidate-re-engagement-intelligence/types";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ROUTE = "/api/candidate-re-engagement-intelligence";

function emptyReEngagementSnapshot(
  session: ReturnType<typeof refreshSessionTerritories>,
  fetchedAt: string,
  requestedRecruiter: string | null,
): CandidateReEngagementIntelligenceSnapshot {
  const recruiterScope = resolveRecruiterOperatingSystemScope(session, requestedRecruiter);
  const scope: CandidateReEngagementIntelligenceSnapshot["scope"] = {
    recruiterName: recruiterScope.recruiterName,
    recruiterLabel: recruiterScope.recruiterLabel,
    territoryStates: recruiterScope.territoryStates,
    role: recruiterScope.role,
    scopedToRecruiter: recruiterScope.scopedToRecruiter,
  };
  return {
    generatedAt: fetchedAt,
    planDate: fetchedAt.slice(0, 10),
    scope,
    executiveSummary: {
      recoverableCandidates: 0,
      potentialPlacements: 0,
      estimatedCoverageGainPercent: 0,
      topRecoveryTerritories: [],
    },
    top25: [],
    top100: [],
    territoryForecasts: [],
    segmentCounts: {
      hot: 0,
      warm: 0,
      cold: 0,
      dormant: 0,
      "former-worker": 0,
      "high-value": 0,
    },
    outreachRecommendations: [],
  };
}

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["recruiter", "admin", "executive"],
    requireTerritory: true,
    auditAction: "candidate_re_engagement_intelligence_read",
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

  return respondExecutiveIntelligenceRoute({
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
          snapshot: emptyReEngagementSnapshot(session, bundle.fetchedAt, requestedRecruiter),
          logExtras: { deferred: true, phase: "candidate_recovery" },
        };
      }
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
      return {
        snapshot,
        logExtras: {
          recoverableCandidates: snapshot.executiveSummary.recoverableCandidates,
          top25Count: snapshot.top25.length,
          phase: "candidate_recovery",
        },
        responseExtras: {
          scopedToRecruiter: snapshot.scope.scopedToRecruiter,
        },
      };
    },
  });
}
