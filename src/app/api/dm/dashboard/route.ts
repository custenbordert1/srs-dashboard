import { getSessionFromRequest } from "@/lib/auth/request-session";
import { applyTerritoryToCandidates, applyTerritoryToJobs } from "@/lib/auth/territory-filter";
import { buildDmDashboardSnapshot } from "@/lib/dm-dashboard/build-dm-dashboard";
import { fetchBreezyCandidates, fetchBreezyJobs } from "@/lib/breezy-api";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: Request) {
  const session = getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  if (session.role === "dm" && session.territoryStates.length === 0) {
    return NextResponse.json({ ok: false, error: "DM has no assigned territory" }, { status: 403 });
  }

  const [jobsResult, candidatesResult] = await Promise.all([
    fetchBreezyJobs("published"),
    fetchBreezyCandidates(),
  ]);

  if (!jobsResult.ok) {
    return NextResponse.json({ ok: false, error: jobsResult.error }, { status: 502 });
  }
  if (!candidatesResult.ok) {
    return NextResponse.json({ ok: false, error: candidatesResult.error }, { status: 502 });
  }

  const jobs = applyTerritoryToJobs(session, jobsResult.jobs);
  const candidates = applyTerritoryToCandidates(session, candidatesResult.candidates);
  const fetchedAt = candidatesResult.fetchedAt;

  const dashboard = buildDmDashboardSnapshot(session, jobs, candidates, fetchedAt);

  return NextResponse.json({
    ok: true,
    dashboard,
    meta: {
      role: session.role,
      territoryStates: dashboard.territoryStates,
      totalPositionsAvailable: jobsResult.jobs.length,
      filteredJobs: jobs.length,
      filteredCandidates: candidates.length,
      partialSync: candidatesResult.truncated ?? false,
    },
  });
}
