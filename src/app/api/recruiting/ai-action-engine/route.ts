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
import { buildAiCommandCenterSnapshot } from "@/lib/ai-recruiting-command-center";
import { buildAiActionCenterSnapshot } from "@/lib/ai-action-engine";
import { buildRecruitingCommandCenter } from "@/lib/recruiting-command-center";
import { fetchMelProjectsSheet } from "@/lib/mel-projects-sheet";
import { parseMelOpportunities } from "@/lib/mel-matching/mel-opportunity-parser";
import { candidatesForJob } from "@/lib/dm-dashboard/territory-shared";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ROUTE = "/api/recruiting/ai-action-engine";

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["admin", "executive", "recruiter", "dm"],
    requireTerritory: true,
    auditAction: "ai_action_engine_read",
  });
  if (isGuardFailure(guard)) return guard;
  const { session } = guard;

  await logBreezyRouteStart(ROUTE, session);
  const breezyCheck = await assertBreezyConfigured(ROUTE);
  if (!breezyCheck.ok) {
    return NextResponse.json({ ok: false, error: breezyCheck.error }, { status: breezyCheck.status });
  }

  const territoryStates = filterStatesForSession(session) ?? undefined;

  const [jobsResult, candidatesResult, workflows, melResult, activeReps] = await Promise.all([
    fetchBreezyJobs("published"),
    fetchBreezyCandidates({ scanMode: "fast" }),
    getCandidateWorkflowState(),
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

  const commandCenter = buildRecruitingCommandCenter(
    { ...candidatesResult, candidates },
    { ...jobsResult, jobs },
  );

  const aiSnapshot = buildAiCommandCenterSnapshot({
    jobs,
    candidates,
    workflows,
    opportunities,
    activeReps: territoryReps,
    coverage: melResult.ok ? coverage : null,
    fetchedAt,
    territoryStates,
    commandCenter,
  });

  const zeroApplicantJobs = jobs.filter((job) => candidatesForJob(job, candidates).length === 0).length;

  const center = await buildAiActionCenterSnapshot({
    aiSnapshot,
    jobs,
    candidates,
    workflows,
    fetchedAt,
    zeroApplicantJobs,
    followUpsDue: aiSnapshot.recruiterCoach.followUpsDueToday.length,
  });

  logBreezyRouteResult(ROUTE, 200, {
    role: session.role,
    actions: center.executiveActions.length,
  });

  return NextResponse.json({
    ok: true,
    center,
    meta: { refreshedAt: new Date().toISOString() },
  });
}
