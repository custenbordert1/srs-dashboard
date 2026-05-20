import { getSessionFromRequest } from "@/lib/auth/request-session";
import { buildExecutiveDashboard } from "@/lib/dm-dashboard/build-executive-dashboard";
import { fetchBreezyCandidates, fetchBreezyJobs } from "@/lib/breezy-api";
import { parseMelOpportunities } from "@/lib/mel-matching/mel-opportunity-parser";
import { fetchMelProjectsSheet } from "@/lib/mel-projects-sheet";
import { assertBreezyConfigured, logBreezyRouteResult, logBreezyRouteStart } from "@/lib/breezy-route-log";
import { breezyFailureBody, breezyFailureHttpStatus } from "@/lib/breezy-http-status";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ROUTE = "/api/executive/dashboard";

export async function GET(request: Request) {
  const session = getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  if (session.role !== "executive") {
    return NextResponse.json({ ok: false, error: "Executive access required" }, { status: 403 });
  }

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

  const melOpportunities = melResult.ok ? parseMelOpportunities(melResult.rows) : [];
  const dashboard = buildExecutiveDashboard(
    jobsResult.jobs,
    candidatesResult.candidates,
    candidatesResult.fetchedAt,
    melOpportunities,
  );

  logBreezyRouteResult(ROUTE, 200, {
    role: session.role,
    breezyOk: true,
    totalJobs: jobsResult.jobs.length,
    totalCandidates: candidatesResult.candidates.length,
  });

  return NextResponse.json(
    {
      ok: true,
      dashboard,
      meta: {
        partialSync: candidatesResult.truncated ?? false,
        totalJobs: jobsResult.jobs.length,
        totalCandidates: candidatesResult.candidates.length,
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
