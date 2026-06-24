import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { applyTerritoryToCandidates, applyTerritoryToJobs } from "@/lib/auth/territory-filter";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { filterMtdCandidates, resolveCandidatesForAutomation } from "@/lib/candidate-ingestion";
import { fetchBreezyJobs } from "@/lib/breezy-api";
import type { CandidateWorkflowStatus } from "@/lib/candidate-workflow-types";
import { getCandidateWorkflowBundle } from "@/lib/candidate-workflow-store";
import { runCandidateProgressionEngine } from "@/lib/candidate-progression-engine";
import { auditFromSession } from "@/lib/security/audit-log";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const TERMINAL_STATUSES = new Set<CandidateWorkflowStatus>([
  "Not Qualified",
  "Active Rep",
  "Loaded in MEL",
]);

export async function POST(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter", "dm"],
    requireTerritory: true,
    auditAction: "workflow_action",
  });
  if (isGuardFailure(guard)) return guard;
  const { session } = guard;

  const [candidatesResult, jobsResult, bundle] = await Promise.all([
    resolveCandidatesForAutomation(),
    fetchBreezyJobs("published"),
    getCandidateWorkflowBundle(),
  ]);

  if (!candidatesResult.ok) {
    return NextResponse.json({ ok: false, error: candidatesResult.error }, { status: 502 });
  }

  const jobs = jobsResult.ok ? applyTerritoryToJobs(session, jobsResult.jobs) : [];
  const jobsByPositionId = new Map(jobs.map((job) => [job.jobId, job]));
  const workflows = { ...bundle.workflows };

  const mtdCandidates = filterMtdCandidates(
    applyTerritoryToCandidates(session, candidatesResult.candidates),
  );
  const eligibleMtd = mtdCandidates.filter((candidate) => {
    const workflow = workflows[candidate.candidateId];
    return workflow && !TERMINAL_STATUSES.has(workflow.workflowStatus);
  });

  const scoredCandidates = eligibleMtd.map((candidate) =>
    buildScoredWorkflowRow(candidate, workflows[candidate.candidateId], {
      job: jobsByPositionId.get(candidate.positionId),
    }),
  );

  const result = await runCandidateProgressionEngine({
    candidates: scoredCandidates,
    workflows,
    byUserId: session.userId,
    persist: true,
  });

  if (result.generated > 0) {
    auditFromSession(session, {
      action: "workflow_action",
      entityType: "workflow",
      entityId: "auto_progression_batch",
      metadata: {
        generated: result.generated,
        skipped: result.skipped,
        candidatesReadyToAdvance: result.metrics.candidatesReadyToAdvance,
        stalledCandidates: result.metrics.stalledCandidates,
        candidatesFromIngestionStore: candidatesResult.fromIngestionStore,
        eligibleMtdCount: eligibleMtd.length,
      },
    });
  }

  const updatedBundle = await getCandidateWorkflowBundle();

  return NextResponse.json({
    ok: true,
    generated: result.generated,
    skipped: result.skipped,
    metrics: result.metrics,
    workflows: updatedBundle.workflows,
    rosters: updatedBundle.rosters,
    updatedAt: updatedBundle.updatedAt,
    eligibleMtdCount: eligibleMtd.length,
    candidatesFromIngestionStore: candidatesResult.fromIngestionStore,
  });
}
