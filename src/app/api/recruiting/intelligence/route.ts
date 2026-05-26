import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { applyTerritoryToCandidates, applyTerritoryToJobs } from "@/lib/auth/territory-filter";
import { normalizeStateCode } from "@/lib/dm-territory-map";
import { listActiveRosterReps } from "@/lib/active-rep-store";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import { listJobDrafts } from "@/lib/job-management/job-draft-store";
import { listRecruiterEscalations } from "@/lib/operational-escalation/operational-escalation-store";
import { buildRecruitingIntelligence } from "@/lib/recruiting-automation/build-recruiting-intelligence";
import { fetchBreezyCandidates, fetchBreezyJobs } from "@/lib/breezy-api";
import { assertBreezyConfigured, logBreezyRouteResult, logBreezyRouteStart } from "@/lib/breezy-route-log";
import { breezyFailureBody, breezyFailureHttpStatus } from "@/lib/breezy-http-status";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ROUTE = "/api/recruiting/intelligence";

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["admin", "executive", "recruiter"],
    requireTerritory: true,
    auditAction: "recruiting_intelligence",
  });
  if (isGuardFailure(guard)) return guard;
  const { session } = guard;

  await logBreezyRouteStart(ROUTE, session);
  const breezyCheck = await assertBreezyConfigured(ROUTE);
  if (!breezyCheck.ok) {
    return NextResponse.json({ ok: false, error: breezyCheck.error }, { status: breezyCheck.status });
  }

  const [jobsResult, candidatesResult, workflows, drafts, escalations, activeReps] =
    await Promise.all([
      fetchBreezyJobs("published"),
      fetchBreezyCandidates(),
      getCandidateWorkflowState(),
      listJobDrafts(),
      listRecruiterEscalations(),
      listActiveRosterReps(),
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

  const territoryReps =
    session.territoryStates.length > 0
      ? activeReps.filter((rep) =>
          session.territoryStates.includes(normalizeStateCode(rep.state)),
        )
      : activeReps;

  const intelligence = buildRecruitingIntelligence(session, jobs, candidates, fetchedAt, workflows, {
    drafts,
    escalations,
    activeReps: territoryReps,
  });

  logBreezyRouteResult(ROUTE, 200, {
    role: session.role,
    breezyOk: true,
    filteredJobs: jobs.length,
    filteredCandidates: candidates.length,
  });

  return NextResponse.json(
    {
      ok: true,
      intelligence,
      meta: {
        role: session.role,
        filteredJobs: jobs.length,
        filteredCandidates: candidates.length,
        workflowCount: Object.keys(workflows).length,
        partialSync: candidatesResult.truncated ?? false,
        refreshedAt: new Date().toISOString(),
      },
    },
    {
      headers: {
        "Cache-Control": "private, max-age=45, stale-while-revalidate=90",
      },
    },
  );
}
