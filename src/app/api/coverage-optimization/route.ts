import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { filterStatesForSession } from "@/lib/auth/permissions";
import { applyTerritoryToCandidates, applyTerritoryToJobs } from "@/lib/auth/territory-filter";
import { normalizeStateCode } from "@/lib/dm-territory-map";
import { listActiveRosterReps } from "@/lib/active-rep-store";
import { fetchBreezyCandidates, fetchBreezyJobs } from "@/lib/breezy-api";
import { breezyFailureBody, breezyFailureHttpStatus } from "@/lib/breezy-http-status";
import { assertBreezyConfigured, logBreezyRouteResult, logBreezyRouteStart } from "@/lib/breezy-route-log";
import { buildCoverageRiskSnapshot } from "@/lib/coverage-risk-engine";
import { buildCoverageOptimizationSnapshot } from "@/lib/coverage-optimization";
import { fetchMelProjectsSheet } from "@/lib/mel-projects-sheet";
import { parseMelOpportunities } from "@/lib/mel-matching/mel-opportunity-parser";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ROUTE = "/api/coverage-optimization";

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["admin", "executive", "recruiter", "dm"],
    requireTerritory: true,
    auditAction: "coverage_optimization_read",
  });
  if (isGuardFailure(guard)) return guard;
  const { session } = guard;

  await logBreezyRouteStart(ROUTE, session);
  const breezyCheck = await assertBreezyConfigured(ROUTE);
  if (!breezyCheck.ok) {
    return NextResponse.json({ ok: false, error: breezyCheck.error }, { status: breezyCheck.status });
  }

  const territoryStates = filterStatesForSession(session) ?? undefined;

  const [jobsResult, candidatesResult, melResult, activeReps] = await Promise.all([
    fetchBreezyJobs("published"),
    fetchBreezyCandidates({ scanMode: "fast" }),
    fetchMelProjectsSheet(),
    listActiveRosterReps(),
  ]);

  if (!jobsResult.ok) {
    return NextResponse.json(breezyFailureBody(jobsResult), {
      status: breezyFailureHttpStatus(jobsResult.error),
    });
  }
  if (!candidatesResult.ok) {
    return NextResponse.json(breezyFailureBody(candidatesResult), {
      status: breezyFailureHttpStatus(candidatesResult.error),
    });
  }

  const jobs = applyTerritoryToJobs(session, jobsResult.jobs);
  const candidates = applyTerritoryToCandidates(session, candidatesResult.candidates);
  const fetchedAt = candidatesResult.fetchedAt;
  const opportunities = melResult.ok ? parseMelOpportunities(melResult.rows) : [];
  const territoryReps =
    territoryStates && territoryStates.length > 0
      ? activeReps.filter((rep) => territoryStates.includes(normalizeStateCode(rep.state)))
      : activeReps;

  const coverage = buildCoverageRiskSnapshot({
    opportunities,
    reps: territoryReps,
    candidates,
    fetchedAt,
    territoryStates,
  });

  const snapshot = buildCoverageOptimizationSnapshot({
    jobs,
    candidates,
    opportunities,
    activeReps: territoryReps,
    coverage: melResult.ok ? coverage : null,
    fetchedAt,
    territoryStates,
  });

  logBreezyRouteResult(ROUTE, 200, {
    role: session.role,
    recommendations: snapshot.recommendations.length,
  });

  return NextResponse.json({
    ok: true,
    snapshot,
    meta: {
      hasMelData: melResult.ok,
      partialSync: candidatesResult.truncated ?? false,
      refreshedAt: new Date().toISOString(),
    },
  });
}
