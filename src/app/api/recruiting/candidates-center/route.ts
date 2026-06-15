import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { breezyFailureBody, breezyFailureHttpStatus } from "@/lib/breezy-http-status";
import { assertBreezyConfigured, logBreezyRouteResult, logBreezyRouteStart } from "@/lib/breezy-route-log";
import { loadRecruitingCandidatesCenterBundle } from "@/lib/recruiting-intelligence/load-recruiting-candidates-center-bundle";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ROUTE = "/api/recruiting/candidates-center";

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["admin", "executive", "recruiter", "dm"],
    requireTerritory: true,
    auditAction: "recruiting_candidates_center_read",
  });
  if (isGuardFailure(guard)) return guard;
  const { session } = guard;

  await logBreezyRouteStart(ROUTE, session);
  const breezyCheck = await assertBreezyConfigured(ROUTE);
  if (!breezyCheck.ok) {
    return NextResponse.json({ ok: false, error: breezyCheck.error }, { status: breezyCheck.status });
  }

  const forceRefresh = new URL(request.url).searchParams.get("forceRefresh") === "1";
  const loaded = await loadRecruitingCandidatesCenterBundle(session, { forceRefresh });

  if (!loaded.ok) {
    const status = breezyFailureHttpStatus(loaded.failure.failure.error);
    logBreezyRouteResult(ROUTE, status, { role: session.role, breezyOk: false });
    return NextResponse.json(breezyFailureBody(loaded.failure.failure), { status });
  }

  const { center } = loaded;

  logBreezyRouteResult(ROUTE, 200, {
    role: session.role,
    breezyOk: true,
    filteredCandidates: center.candidatesResult.candidates.length,
    filteredJobs: center.jobsResult.jobs.length,
    partial: center.meta.partialSync,
  });

  return NextResponse.json(
    {
      ok: true,
      center,
    },
    {
      headers: {
        "Cache-Control": "private, max-age=45, stale-while-revalidate=90",
      },
    },
  );
}
