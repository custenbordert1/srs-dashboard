import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { applyTerritoryToCandidates, applyTerritoryToJobs } from "@/lib/auth/territory-filter";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import { filterMtdCandidates, resolveCandidatesForAutomation } from "@/lib/candidate-ingestion";
import { fetchBreezyJobs } from "@/lib/breezy-api";
import { getCandidateWorkflowBundle } from "@/lib/candidate-workflow-store";
import { runRecruiterActionEngine } from "@/lib/recruiter-action-engine";
import { auditFromSession } from "@/lib/security/audit-log";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

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
  const assignedMtd = mtdCandidates.filter((candidate) => {
    const workflow = workflows[candidate.candidateId];
    return workflow && !isUnassignedRecruiter(workflow.assignedRecruiter);
  });

  const scoredCandidates = assignedMtd.map((candidate) =>
    buildScoredWorkflowRow(candidate, workflows[candidate.candidateId], {
      job: jobsByPositionId.get(candidate.positionId),
    }),
  );

  const result = await runRecruiterActionEngine({
    candidates: scoredCandidates,
    workflows,
    byUserId: session.userId,
    persist: true,
  });

  if (result.generated > 0) {
    auditFromSession(session, {
      action: "workflow_action",
      entityType: "workflow",
      entityId: "auto_action_batch",
      metadata: {
        generated: result.generated,
        skipped: result.skipped,
        overdueRecruiterActions: result.metrics.overdueRecruiterActions,
        candidatesFromIngestionStore: candidatesResult.fromIngestionStore,
        assignedMtdCount: assignedMtd.length,
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
    assignedMtdCount: assignedMtd.length,
    candidatesFromIngestionStore: candidatesResult.fromIngestionStore,
  });
}
