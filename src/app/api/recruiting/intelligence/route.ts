import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { applyTerritoryToCandidates, applyTerritoryToJobs } from "@/lib/auth/territory-filter";
import { normalizeStateCode } from "@/lib/dm-territory-map";
import { listActiveRosterReps } from "@/lib/active-rep-store";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import { listJobDrafts } from "@/lib/job-management/job-draft-store";
import { listRecruiterEscalations } from "@/lib/operational-escalation/operational-escalation-store";
import { buildRecruitingIntelligence } from "@/lib/recruiting-automation/build-recruiting-intelligence";
import { fetchMelProjectsSheet } from "@/lib/mel-projects-sheet";
import { buildBreezyAtsMetrics } from "@/lib/breezy-ats-metrics";
import { fetchBreezyCandidates, fetchBreezyJobs, isPartialBreezyPositionSync } from "@/lib/breezy-api";
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

  const [jobsResult, candidatesResult, workflows, drafts, escalations, activeReps, melResult] =
    await Promise.all([
      fetchBreezyJobs("published"),
      fetchBreezyCandidates(),
      getCandidateWorkflowState(),
      listJobDrafts(),
      listRecruiterEscalations(),
      listActiveRosterReps(),
      fetchMelProjectsSheet(),
    ]);

  const partialErrors: string[] = [];
  const breezyJobsOk = jobsResult.ok;
  const breezyCandidatesOk = candidatesResult.ok;

  if (!breezyJobsOk) {
    partialErrors.push(`Published jobs unavailable: ${jobsResult.error}`);
  }
  if (!breezyCandidatesOk) {
    partialErrors.push(`Candidate sync unavailable: ${candidatesResult.error}`);
  }

  if (!breezyJobsOk && !breezyCandidatesOk && drafts.length === 0 && escalations.length === 0) {
    const status = breezyFailureHttpStatus(jobsResult.error ?? candidatesResult.error);
    logBreezyRouteResult(ROUTE, status, { role: session.role, breezyOk: false, phase: "all" });
    return NextResponse.json(
      breezyFailureBody(breezyJobsOk ? candidatesResult : jobsResult),
      { status },
    );
  }

  const jobs = breezyJobsOk ? applyTerritoryToJobs(session, jobsResult.jobs) : [];
  const candidates = breezyCandidatesOk
    ? applyTerritoryToCandidates(session, candidatesResult.candidates)
    : [];
  const fetchedAt =
    (breezyCandidatesOk ? candidatesResult.fetchedAt : null) ??
    (breezyJobsOk ? jobsResult.fetchedAt : null) ??
    new Date().toISOString();

  const territoryReps =
    session.territoryStates.length > 0
      ? activeReps.filter((rep) =>
          session.territoryStates.includes(normalizeStateCode(rep.state)),
        )
      : activeReps;

  const activeRepsByState: Record<string, number> = {};
  for (const rep of territoryReps) {
    if (!rep.active) continue;
    const state = normalizeStateCode(rep.state);
    activeRepsByState[state] = (activeRepsByState[state] ?? 0) + 1;
  }

  const intelligence = buildRecruitingIntelligence(session, jobs, candidates, fetchedAt, workflows, {
    drafts,
    escalations,
    activeReps: territoryReps,
  });

  if (!melResult.ok) {
    partialErrors.push(`MEL store routing data unavailable: ${melResult.error}`);
  }

  const ancillaryPartialErrors = partialErrors.filter(
    (line) =>
      !line.startsWith("Published jobs unavailable:") &&
      !line.startsWith("Candidate sync unavailable:"),
  );

  const ats =
    breezyCandidatesOk
      ? buildBreezyAtsMetrics(candidatesResult, breezyJobsOk ? jobsResult : null, {
          candidatesLoadedOverride: candidates.length,
          publishedJobsOverride: jobs.length,
          ancillaryPartialErrors,
        })
      : null;

  const partialSync =
    !breezyCandidatesOk ||
    !breezyJobsOk ||
    (breezyCandidatesOk && isPartialBreezyPositionSync(candidatesResult)) ||
    ancillaryPartialErrors.length > 0;

  logBreezyRouteResult(ROUTE, 200, {
    role: session.role,
    breezyOk: breezyJobsOk && breezyCandidatesOk,
    filteredJobs: jobs.length,
    filteredCandidates: candidates.length,
    partial: partialSync,
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
        partialSync,
        partialErrors,
        breezyJobsOk,
        breezyCandidatesOk,
        escalations,
        activeRepsByState,
        refreshedAt: new Date().toISOString(),
        ats,
        positionsScanned: ats?.positionsScanned ?? 0,
        totalPositionsAvailable: ats?.totalPositionsAvailable ?? 0,
        scanMode: ats?.scanMode ?? null,
        lastSuccessfulSync: ats?.lastSuccessfulSync ?? fetchedAt,
      },
    },
    {
      headers: {
        "Cache-Control": "private, max-age=45, stale-while-revalidate=90",
      },
    },
  );
}
