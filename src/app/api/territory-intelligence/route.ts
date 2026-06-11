import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { filterStatesForSession } from "@/lib/auth/permissions";
import { applyTerritoryToCandidates, applyTerritoryToJobs } from "@/lib/auth/territory-filter";
import { normalizeStateCode } from "@/lib/dm-territory-map";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import { buildCoverageRiskSnapshot } from "@/lib/coverage-risk-engine";
import { fetchBreezyCandidates, fetchBreezyJobs } from "@/lib/breezy-api";
import { breezyFailureBody, breezyFailureHttpStatus } from "@/lib/breezy-http-status";
import { assertBreezyConfigured, logBreezyRouteResult, logBreezyRouteStart } from "@/lib/breezy-route-log";
import { fetchMelProjectsSheet } from "@/lib/mel-projects-sheet";
import { parseMelOpportunities } from "@/lib/mel-matching/mel-opportunity-parser";
import { listActiveRosterReps } from "@/lib/active-rep-store";
import { buildTerritoryIntelligenceCenter } from "@/lib/territory-intelligence";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ROUTE = "/api/territory-intelligence";

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["admin", "executive", "recruiter"],
    requireTerritory: true,
    auditAction: "territory_intelligence",
  });
  if (isGuardFailure(guard)) return guard;
  const { session } = guard;

  await logBreezyRouteStart(ROUTE, session);
  const breezyCheck = await assertBreezyConfigured(ROUTE);
  if (!breezyCheck.ok) {
    return NextResponse.json({ ok: false, error: breezyCheck.error }, { status: breezyCheck.status });
  }

  const [jobsResult, candidatesResult, workflows, melResult, activeReps] = await Promise.all([
    fetchBreezyJobs("published"),
    fetchBreezyCandidates({ scanMode: "fast" }),
    getCandidateWorkflowState(),
    fetchMelProjectsSheet(),
    listActiveRosterReps(),
  ]);

  if (!jobsResult.ok) {
    const status = breezyFailureHttpStatus(jobsResult.error);
    logBreezyRouteResult(ROUTE, status, { role: session.role, breezyOk: false });
    return NextResponse.json(breezyFailureBody(jobsResult), { status });
  }
  if (!candidatesResult.ok) {
    const status = breezyFailureHttpStatus(candidatesResult.error);
    logBreezyRouteResult(ROUTE, status, { role: session.role, breezyOk: false });
    return NextResponse.json(breezyFailureBody(candidatesResult), { status });
  }

  const jobs = applyTerritoryToJobs(session, jobsResult.jobs);
  const candidates = applyTerritoryToCandidates(session, candidatesResult.candidates);
  const fetchedAt = candidatesResult.fetchedAt;
  const melOpportunities = melResult.ok ? parseMelOpportunities(melResult.rows) : [];

  const territoryStates = filterStatesForSession(session) ?? undefined;
  const territoryReps =
    territoryStates && territoryStates.length > 0
      ? activeReps.filter((rep) =>
          territoryStates.includes(normalizeStateCode(rep.state)),
        )
      : activeReps;

  const coverage = buildCoverageRiskSnapshot({
    opportunities: melOpportunities,
    reps: territoryReps,
    candidates,
    fetchedAt,
    territoryStates,
  });

  const center = buildTerritoryIntelligenceCenter({
    jobs,
    candidates,
    fetchedAt,
    coverage,
    workflows,
  });

  logBreezyRouteResult(ROUTE, 200, {
    role: session.role,
    breezyOk: true,
    territories: center.territories.length,
  });

  return NextResponse.json({
    ok: true,
    center,
    meta: {
      partialSync: candidatesResult.truncated ?? false,
      scanMode: candidatesResult.scanMode ?? "fast",
      positionsScanned: candidatesResult.positionsScanned ?? 0,
      totalPositionsAvailable: candidatesResult.totalPositionsAvailable ?? 0,
      hasCoverageData: melResult.ok,
      refreshedAt: new Date().toISOString(),
    },
  });
}
