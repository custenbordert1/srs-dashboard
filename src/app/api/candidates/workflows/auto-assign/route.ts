import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { applyTerritoryToCandidates, applyTerritoryToJobs } from "@/lib/auth/territory-filter";
import { filterMtdCandidates, resolveCandidatesForAutomation } from "@/lib/candidate-ingestion";
import { fetchBreezyJobs } from "@/lib/breezy-api";
import { getCandidateWorkflowBundle } from "@/lib/candidate-workflow-store";
import { runRecruiterAssignmentEngine } from "@/lib/recruiter-assignment-engine";
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

  const mtdCandidates = filterMtdCandidates(
    applyTerritoryToCandidates(session, candidatesResult.candidates),
  );
  const jobs = jobsResult.ok ? applyTerritoryToJobs(session, jobsResult.jobs) : [];
  const jobsByPositionId = new Map(jobs.map((job) => [job.jobId, job]));

  const result = await runRecruiterAssignmentEngine({
    candidates: mtdCandidates,
    workflows: bundle.workflows,
    rosters: bundle.rosters,
    jobsByPositionId,
    byUserId: session.userId,
    persist: true,
  });

  if (result.assigned > 0) {
    auditFromSession(session, {
      action: "workflow_action",
      entityType: "workflow",
      entityId: "auto_assign_batch",
      metadata: {
        assigned: result.assigned,
        skipped: result.skipped,
        autoAssignmentRate: result.metrics.autoAssignmentRate,
        candidatesFromIngestionStore: candidatesResult.fromIngestionStore,
        mtdCandidateCount: mtdCandidates.length,
      },
    });
  }

  const updatedBundle = await getCandidateWorkflowBundle();

  return NextResponse.json({
    ok: true,
    assigned: result.assigned,
    skipped: result.skipped,
    metrics: result.metrics,
    workflows: updatedBundle.workflows,
    rosters: updatedBundle.rosters,
    updatedAt: updatedBundle.updatedAt,
    mtdCandidateCount: mtdCandidates.length,
    candidatesFromIngestionStore: candidatesResult.fromIngestionStore,
  });
}
