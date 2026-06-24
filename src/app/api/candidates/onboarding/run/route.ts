import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { fetchBreezyJobs } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { filterMtdCandidates } from "@/lib/candidate-ingestion/mtd-candidates";
import { listIngestedCandidates, readIngestionStore } from "@/lib/candidate-ingestion/ingestion-store";
import { runCandidateOnboarding } from "@/lib/candidate-onboarding-engine";
import { getCandidateWorkflowBundle } from "@/lib/candidate-workflow-store";
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

  const [store, bundle, jobsResult] = await Promise.all([
    readIngestionStore(),
    getCandidateWorkflowBundle(),
    fetchBreezyJobs("published"),
  ]);
  const jobsByPositionId = new Map(
    (jobsResult.ok ? jobsResult.jobs : []).map((job) => [job.jobId, job]),
  );
  const mtd = filterMtdCandidates(listIngestedCandidates(store));
  const candidates = mtd.map((candidate) =>
    buildScoredWorkflowRow(candidate, bundle.workflows[candidate.candidateId], {
      job: jobsByPositionId.get(candidate.positionId),
    }),
  );

  const result = await runCandidateOnboarding({
    candidates,
    byUserId: session.userId,
  });

  if (result.ok && result.packetsSent > 0) {
    auditFromSession(session, {
      action: "workflow_action",
      entityType: "workflow",
      entityId: "candidate_onboarding_run",
      metadata: {
        packetsSent: result.packetsSent,
        readyForMelCount: result.readyForMelCount,
        dryRun: result.dryRun,
      },
    });
  }

  return NextResponse.json(result);
}
