import { auditTerritoryAccess, guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { buildExecutiveDashboard } from "@/lib/dm-dashboard/build-executive-dashboard";
import { fetchOrgAtsReportingBundle } from "@/lib/breezy-ats-reporting";
import { isPartialBreezyPositionSync } from "@/lib/breezy-api";
import { parseMelOpportunities } from "@/lib/mel-matching/mel-opportunity-parser";
import { fetchMelProjectsSheet } from "@/lib/mel-projects-sheet";
import { assertBreezyConfigured, logBreezyRouteResult, logBreezyRouteStart } from "@/lib/breezy-route-log";
import { breezyFailureBody, breezyFailureHttpStatus } from "@/lib/breezy-http-status";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ROUTE = "/api/executive/dashboard";

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive"],
    auditAction: "executive_dashboard",
  });
  if (isGuardFailure(guard)) return guard;
  const { session } = guard;
  auditTerritoryAccess(session, "/api/executive/dashboard");

  await logBreezyRouteStart(ROUTE, session);
  const breezyCheck = await assertBreezyConfigured(ROUTE);
  if (!breezyCheck.ok) {
    return NextResponse.json({ ok: false, error: breezyCheck.error }, { status: breezyCheck.status });
  }

  const [atsBundle, melResult] = await Promise.all([
    fetchOrgAtsReportingBundle(),
    fetchMelProjectsSheet(),
  ]);

  if (!atsBundle.ok) {
    const status = breezyFailureHttpStatus(atsBundle.error);
    logBreezyRouteResult(ROUTE, status, { role: session.role, breezyOk: false, phase: "ats" });
    return NextResponse.json(
      breezyFailureBody({
        ok: false,
        error: atsBundle.error,
        fetchedAt: new Date().toISOString(),
      }),
      { status },
    );
  }

  const { jobs: jobsResult, candidates: candidatesResult, ats: baseAts } = atsBundle;
  const ats = {
    ...baseAts,
    ancillaryPartialErrors: melResult.ok
      ? baseAts.ancillaryPartialErrors
      : [
          ...baseAts.ancillaryPartialErrors,
          `MEL store routing data unavailable: ${melResult.error}`,
        ],
  };

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
        partialSync: isPartialBreezyPositionSync(candidatesResult) || !melResult.ok,
        scanMode: ats.scanMode ?? "fast",
        positionsScanned: ats.positionsScanned,
        totalPositionsAvailable: ats.totalPositionsAvailable,
        totalJobs: ats.publishedJobs,
        totalCandidates: ats.candidatesLoaded,
        refreshedAt: new Date().toISOString(),
        ats,
        lastSuccessfulSync: ats.lastSuccessfulSync,
      },
    },
    {
      headers: {
        "Cache-Control": "private, max-age=30, stale-while-revalidate=60",
      },
    },
  );
}
