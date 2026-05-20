import { auditTerritoryAccess, guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { applyTerritoryToCandidates, applyTerritoryToJobs } from "@/lib/auth/territory-filter";
import { buildDmDashboardSnapshot } from "@/lib/dm-dashboard/build-dm-dashboard";
import { fetchBreezyCandidates, fetchBreezyJobs } from "@/lib/breezy-api";
import { parseMelOpportunities } from "@/lib/mel-matching/mel-opportunity-parser";
import { fetchMelProjectsSheet } from "@/lib/mel-projects-sheet";
import { assertBreezyConfigured, logBreezyRouteResult, logBreezyRouteStart } from "@/lib/breezy-route-log";
import { breezyFailureBody, breezyFailureHttpStatus } from "@/lib/breezy-http-status";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ROUTE = "/api/dm/dashboard";

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["dm", "executive", "recruiter"],
    requireTerritory: true,
    auditAction: "dm_dashboard",
  });
  if (isGuardFailure(guard)) return guard;
  const { session } = guard;
  auditTerritoryAccess(session, "/api/dm/dashboard");

  await logBreezyRouteStart(ROUTE, session);
  const breezyCheck = await assertBreezyConfigured(ROUTE);
  if (!breezyCheck.ok) {
    return NextResponse.json({ ok: false, error: breezyCheck.error }, { status: breezyCheck.status });
  }

  const [jobsResult, candidatesResult, melResult] = await Promise.all([
    fetchBreezyJobs("published"),
    fetchBreezyCandidates(),
    fetchMelProjectsSheet(),
  ]);

  if (!jobsResult.ok) {
    const status = breezyFailureHttpStatus(jobsResult.error);
    logBreezyRouteResult(ROUTE, status, { role: session.role, breezyOk: false, phase: "jobs" });
    return NextResponse.json(breezyFailureBody(jobsResult), { status });
  }
  if (!candidatesResult.ok) {
    const status = breezyFailureHttpStatus(candidatesResult.error);
    logBreezyRouteResult(ROUTE, status, { role: session.role, breezyOk: false, phase: "candidates" });
    return NextResponse.json(breezyFailureBody(candidatesResult), { status });
  }

  const jobs = applyTerritoryToJobs(session, jobsResult.jobs);
  const candidates = applyTerritoryToCandidates(session, candidatesResult.candidates);
  const fetchedAt = candidatesResult.fetchedAt;

  const melRows = melResult.ok ? melResult.rows : [];
  const melOpportunities = melResult.ok ? parseMelOpportunities(melRows) : [];
  const dashboard = buildDmDashboardSnapshot(
    session,
    jobs,
    candidates,
    fetchedAt,
    melOpportunities,
    melRows,
  );

  logBreezyRouteResult(ROUTE, 200, {
    role: session.role,
    breezyOk: true,
    filteredJobs: jobs.length,
    filteredCandidates: candidates.length,
    territoryStates: dashboard.territoryStates,
  });

  return NextResponse.json(
    {
      ok: true,
      dashboard,
      meta: {
        role: session.role,
        territoryStates: dashboard.territoryStates,
        totalPositionsAvailable: jobsResult.jobs.length,
        filteredJobs: jobs.length,
        filteredCandidates: candidates.length,
        partialSync: candidatesResult.truncated ?? false,
        refreshedAt: new Date().toISOString(),
      },
    },
    {
      headers: {
        "Cache-Control": "private, max-age=30, stale-while-revalidate=60",
      },
    },
  );
}
