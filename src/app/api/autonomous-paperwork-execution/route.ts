import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { runPaperworkExecutionPreview } from "@/lib/autonomous-paperwork-execution-engine";
import { loadP71FeatureFlags } from "@/lib/autonomous-paperwork-execution-engine/feature-flags-store";
import { fetchBreezyJobs } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { buildOnboardingSendQueueMetrics } from "@/lib/candidate-onboarding-send-queue/build-send-queue-metrics";
import { filterMtdCandidates } from "@/lib/candidate-ingestion/mtd-candidates";
import { listIngestedCandidates, readIngestionStore } from "@/lib/candidate-ingestion/ingestion-store";
import { listAllCandidateOnboardingRecords } from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import { loadCandidateOnboardingPolicy } from "@/lib/candidate-onboarding-engine/onboarding-policy-store";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/autonomous-paperwork-execution
 * Read-only P71 dashboard — execution disabled by default, simulates workflow in preview mode.
 */
export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter", "dm"],
    requireTerritory: true,
    auditAction: "workflow_action",
  });
  if (isGuardFailure(guard)) return guard;

  const [store, workflows, jobsResult, onboardingRecords, policy, flags, sendQueueMetrics] =
    await Promise.all([
      readIngestionStore(),
      getCandidateWorkflowState(),
      fetchBreezyJobs("published"),
      listAllCandidateOnboardingRecords(),
      loadCandidateOnboardingPolicy(),
      loadP71FeatureFlags(),
      buildOnboardingSendQueueMetrics(),
    ]);

  const jobsByPositionId = new Map(
    (jobsResult.ok ? jobsResult.jobs : []).map((job) => [job.jobId, job]),
  );
  const mtd = filterMtdCandidates(listIngestedCandidates(store));
  const scoredRows = mtd.map((candidate) =>
    buildScoredWorkflowRow(candidate, workflows[candidate.candidateId], {
      job: jobsByPositionId.get(candidate.positionId),
    }),
  );

  const started = performance.now();
  const result = await runPaperworkExecutionPreview({
    candidates: scoredRows,
    onboardingRecords,
    policy,
    flags,
    sendQueueMetrics,
    fetchedAt: store.lastChunkAt ?? store.updatedAt ?? new Date().toISOString(),
  });

  return NextResponse.json({
    ...result,
    meta: { buildMs: Math.round(performance.now() - started) },
  });
}
