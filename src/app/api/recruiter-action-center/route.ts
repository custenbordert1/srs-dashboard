import { auditTerritoryAccess, guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { refreshSessionTerritories } from "@/lib/auth/session-territories";
import { breezyFailureBody, breezyFailureHttpStatus } from "@/lib/breezy-http-status";
import { assertBreezyConfigured, logBreezyRouteResult, logBreezyRouteStart } from "@/lib/breezy-route-log";
import { buildRecruiterActionCenterSnapshot } from "@/lib/recruiter-action-center";
import type { SmartFilterId } from "@/lib/recruiter-action-center/types";
import { loadRecruitingIntelligenceRouteBundle } from "@/lib/recruiting-intelligence/load-recruiting-intelligence-route-bundle";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ROUTE = "/api/recruiter-action-center";

const SMART_FILTERS = new Set<SmartFilterId>([
  "work-now",
  "overdue",
  "paperwork",
  "ready-for-mel",
  "interview-follow-up",
  "no-touch-24h",
  "no-touch-48h",
  "assigned-to-me",
  "unassigned",
  "high-priority",
]);

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["recruiter", "admin", "executive"],
    requireTerritory: true,
    auditAction: "recruiter_action_center_read",
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
  const actingRecruiter = url.searchParams.get("actingRecruiter")?.trim() || undefined;
  const filterParam = url.searchParams.get("filter")?.trim() as SmartFilterId | undefined;
  const activeFilter = filterParam && SMART_FILTERS.has(filterParam) ? filterParam : null;

  const loaded = await loadRecruitingIntelligenceRouteBundle(session, {
    forceRefresh,
    unscopedForAdmin: false,
    scopeRepsToTerritory: true,
  });

  if (!loaded.ok) {
    const status = breezyFailureHttpStatus(loaded.failure.failure.error);
    logBreezyRouteResult(ROUTE, status, { role: session.role, breezyOk: false });
    return NextResponse.json(breezyFailureBody(loaded.failure.failure), { status });
  }

  const snapshot = buildRecruiterActionCenterSnapshot({
    session,
    bundle: loaded.bundle,
    actingRecruiter,
    requestedRecruiter,
    activeFilter,
  });

  logBreezyRouteResult(ROUTE, 200, {
    role: session.role,
    breezyOk: true,
    candidateCount: snapshot.allCandidates.length,
  });

  return NextResponse.json({
    ok: true,
    snapshot,
    meta: {
      refreshedAt: loaded.bundle.fetchedAt,
      intelligenceCache: loaded.bundle.intelligenceCache,
    },
  });
}
