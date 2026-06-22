import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { applyTerritoryToCandidates, applyTerritoryToJobs } from "@/lib/auth/territory-filter";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import {
  buildControlCenterSnapshot,
  executeAutomationRun,
  getAutomationRun,
  listAutomationRuns,
  planAllAutomations,
} from "@/lib/hiring-automation-engine";
import {
  approveAutomationRun,
  rejectAutomationRun,
} from "@/lib/hiring-automation-engine/automation-run-store";
import { fetchBreezyCandidates, fetchBreezyJobs } from "@/lib/breezy-api";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET() {
  const guard = guardApiRoute(new Request("http://local"), {
    allowedRoles: ["executive", "recruiter", "dm"],
  });
  if (isGuardFailure(guard)) return guard;

  const runs = await listAutomationRuns();
  return NextResponse.json({
    ok: true,
    snapshot: buildControlCenterSnapshot(runs),
    runs,
  });
}

export async function POST(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter", "dm"],
    requireTerritory: true,
    auditAction: "hiring_automation_plan",
  });
  if (isGuardFailure(guard)) return guard;
  const { session } = guard;

  const [candidatesResult, jobsResult, workflows] = await Promise.all([
    fetchBreezyCandidates(),
    fetchBreezyJobs("published"),
    getCandidateWorkflowState(),
  ]);

  if (!candidatesResult.ok) {
    return NextResponse.json({ ok: false, error: candidatesResult.error }, { status: 502 });
  }

  const candidates = applyTerritoryToCandidates(session, candidatesResult.candidates);
  const jobs = jobsResult.ok ? applyTerritoryToJobs(session, jobsResult.jobs) : [];

  const rows = candidates.map((candidate) =>
    buildScoredWorkflowRow(candidate, workflows[candidate.candidateId]),
  );

  const jobContexts = jobs.map((job) => ({
    positionId: job.jobId,
    breezyJobId: job.jobId,
    title: job.name,
    city: job.city,
    state: job.state,
    pipelineStatus: job.status,
  }));

  const result = await planAllAutomations({
    candidates: rows,
    jobs: jobContexts,
    actor: session.userId,
  });

  const runs = await listAutomationRuns();
  return NextResponse.json({
    ok: true,
    planned: result,
    snapshot: buildControlCenterSnapshot(runs),
  });
}
