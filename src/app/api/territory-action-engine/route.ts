import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { filterStatesForSession } from "@/lib/auth/permissions";
import { applyTerritoryToCandidates, applyTerritoryToJobs } from "@/lib/auth/territory-filter";
import { normalizeStateCode } from "@/lib/dm-territory-map";
import { listActiveRosterReps } from "@/lib/active-rep-store";
import { fetchBreezyCandidates, fetchBreezyJobs } from "@/lib/breezy-api";
import { breezyFailureBody, breezyFailureHttpStatus } from "@/lib/breezy-http-status";
import { assertBreezyConfigured, logBreezyRouteResult, logBreezyRouteStart } from "@/lib/breezy-route-log";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import { buildCoverageRiskSnapshot } from "@/lib/coverage-risk-engine";
import { fetchMelProjectsSheet } from "@/lib/mel-projects-sheet";
import { parseMelOpportunities } from "@/lib/mel-matching/mel-opportunity-parser";
import { buildTerritoryActionCenterSnapshot } from "@/lib/territory-action-engine";
import { buildWorkforceOpsCenterSnapshot } from "@/lib/workforce-ops-center";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ROUTE = "/api/territory-action-engine";

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["admin", "executive", "recruiter", "dm"],
    requireTerritory: true,
    auditAction: "territory_action_engine_read",
  });
  if (isGuardFailure(guard)) return guard;
  const { session } = guard;

  await logBreezyRouteStart(ROUTE, session);
  const breezyCheck = await assertBreezyConfigured(ROUTE);
  if (!breezyCheck.ok) {
    return NextResponse.json({ ok: false, error: breezyCheck.error }, { status: breezyCheck.status });
  }

  const territoryStates = filterStatesForSession(session) ?? undefined;
  const actingRecruiter = session.name?.trim() || session.email?.split("@")[0] || "";

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

  const workforce = buildWorkforceOpsCenterSnapshot({
    jobs,
    candidates,
    workflows,
    fetchedAt,
    coverage,
    opportunities,
    activeReps: territoryReps,
  });

  const center = buildTerritoryActionCenterSnapshot({
    jobs,
    candidates,
    workflows,
    fetchedAt,
    coverage,
    opportunities,
    activeReps: territoryReps,
    workforceQueue: workforce.operationsQueue,
    actingRecruiter,
  });

  logBreezyRouteResult(ROUTE, 200, {
    role: session.role,
    breezyOk: true,
    actionCount: center.meta.totalActions,
  });

  return NextResponse.json({
    ok: true,
    center,
    meta: {
      partialSync: candidatesResult.partial ?? false,
      scanMode: candidatesResult.scanMode,
      positionsScanned: candidatesResult.positionsScanned,
      totalPositionsAvailable: candidatesResult.totalPositionsAvailable,
      hasCoverageData: opportunities.length > 0,
      refreshedAt: fetchedAt,
      manualOnly: true,
    },
  });
}
