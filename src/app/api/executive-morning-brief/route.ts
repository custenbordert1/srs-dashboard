import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { listExecutiveAlertFollowUps } from "@/lib/alerts/executive-alert-status-store";
import { assertBreezyConfigured } from "@/lib/breezy-route-log";
import { buildExecutiveMorningBriefSnapshot } from "@/lib/executive-morning-brief";
import type { ExecutiveMorningBriefSnapshot } from "@/lib/executive-morning-brief/types";
import { ExecutiveRouteTimer } from "@/lib/executive-routes/executive-route-profiling";
import { respondExecutiveIntelligenceRoute } from "@/lib/executive-routes/executive-intelligence-route";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ROUTE = "/api/executive-morning-brief";

function emptyMorningBriefSnapshot(fetchedAt: string): ExecutiveMorningBriefSnapshot {
  const planDate = fetchedAt.slice(0, 10);
  return {
    generatedAt: fetchedAt,
    planDate,
    scorecard: [],
    recruitingHealth: { score: 0, tier: "at-risk", summary: "Partial snapshot." },
    dailyPriorities: [],
    territoryRisks: [],
    recruiterPerformance: { rows: [], topPerformers: [], needsAttention: [] },
    coverageForecast: [],
    automationOpportunities: {
      jobRefreshDrafts: 0,
      postingDrafts: 0,
      followUpCampaigns: 0,
      pendingApprovals: 0,
      highestImpact: [],
    },
    recommendationIntelligence: {
      topPerforming: [],
      worstPerforming: [],
      overallSuccessRate: 0,
      roiHighlights: [],
    },
    executiveRecommendations: [],
    narratives: {
      today: "Serving cached intelligence — full morning brief refreshes in background.",
      thisWeek: "",
      outlook30Day: "",
    },
    emailDigest: {
      subject: `SRS Executive Morning Brief — ${planDate}`,
      generatedAt: fetchedAt,
      recipients: [],
      sections: {
        executiveSummary: "",
        topRisks: [],
        topOpportunities: [],
        forecast: "",
        recommendedActions: [],
      },
      bodyText: "",
    },
  };
}

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["admin", "executive"],
    auditAction: "executive_morning_brief_read",
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
          snapshot: emptyMorningBriefSnapshot(bundle.fetchedAt),
          logExtras: { deferred: true, phase: "executive_morning_brief" },
        };
      }
      const followUps = await listExecutiveAlertFollowUps();
      const snapshot = await buildExecutiveMorningBriefSnapshot({
        bundle,
        followUps,
        persistRecommendations: false,
      });
      return {
        snapshot,
        logExtras: {
          priorityCount: snapshot.dailyPriorities.length,
          territoryRiskCount: snapshot.territoryRisks.length,
          healthScore: snapshot.recruitingHealth.score,
          phase: "executive_morning_brief",
        },
      };
    },
  });
}
