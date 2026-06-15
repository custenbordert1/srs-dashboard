import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { isAdminRole } from "@/lib/auth/roles";
import { applyTerritoryToCandidates, applyTerritoryToJobs } from "@/lib/auth/territory-filter";
import { listActiveRosterReps } from "@/lib/active-rep-store";
import { fetchBreezyCandidates, fetchBreezyJobs } from "@/lib/breezy-api";
import { breezyFailureBody, breezyFailureHttpStatus } from "@/lib/breezy-http-status";
import { assertBreezyConfigured, logBreezyRouteResult, logBreezyRouteStart } from "@/lib/breezy-route-log";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import { buildCoverageRiskSnapshot } from "@/lib/coverage-risk-engine";
import { buildExecutiveOperationsCenterSnapshot } from "@/lib/executive-operations-center";
import { buildWorkforceOpsCenterSnapshot } from "@/lib/workforce-ops-center";
import { fetchMelProjectsSheet } from "@/lib/mel-projects-sheet";
import { parseMelOpportunities } from "@/lib/mel-matching/mel-opportunity-parser";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ROUTE = "/api/executive-operations-center";

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["admin", "executive"],
    auditAction: "executive_operations_center_read",
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

  const jobs = isAdminRole(session.role)
    ? jobsResult.jobs
    : applyTerritoryToJobs(session, jobsResult.jobs);
  const candidates = isAdminRole(session.role)
    ? candidatesResult.candidates
    : applyTerritoryToCandidates(session, candidatesResult.candidates);
  const fetchedAt = candidatesResult.fetchedAt;
  const opportunities = melResult.ok ? parseMelOpportunities(melResult.rows) : [];

  const coverage = buildCoverageRiskSnapshot({
    opportunities,
    reps: activeReps,
    candidates,
    fetchedAt,
    territoryStates: undefined,
  });

  const workforce = buildWorkforceOpsCenterSnapshot({
    jobs,
    candidates,
    workflows,
    fetchedAt,
    coverage,
    opportunities,
    activeReps,
  });

  const center = buildExecutiveOperationsCenterSnapshot({
    jobs,
    candidates,
    workflows,
    fetchedAt,
    coverage,
    opportunities,
    activeReps,
    workforceQueue: workforce.operationsQueue,
  });

  logBreezyRouteResult(ROUTE, 200, {
    role: session.role,
    breezyOk: true,
    healthScore: center.companyHealth.score,
  });

  return NextResponse.json({
    ok: true,
    center,
    meta: {
      partialSync: candidatesResult.partial ?? false,
      hasCoverageData: opportunities.length > 0,
      refreshedAt: fetchedAt,
      manualOnly: true,
    },
  });
}
