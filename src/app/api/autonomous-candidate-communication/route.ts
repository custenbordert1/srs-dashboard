import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { loadP73FeatureFlags } from "@/lib/autonomous-candidate-communication-engine/feature-flags-store";
import { runAutonomousCandidateCommunicationPreview } from "@/lib/autonomous-candidate-communication-engine";
import { fetchBreezyJobs } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { filterMtdCandidates } from "@/lib/candidate-ingestion/mtd-candidates";
import { listIngestedCandidates, readIngestionStore } from "@/lib/candidate-ingestion/ingestion-store";
import { listAllCandidateOnboardingRecords } from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import { loadCandidateOnboardingPolicy } from "@/lib/candidate-onboarding-engine/onboarding-policy-store";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * GET /api/autonomous-candidate-communication
 * GET /api/autonomous-candidate-communication?candidateId=...
 *
 * Read-only preview — no SMTP, SMS, or production writes.
 */
export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter", "dm"],
    requireTerritory: true,
    auditAction: "recruiting_intelligence",
  });
  if (isGuardFailure(guard)) return guard;

  const url = new URL(request.url);
  const candidateId = url.searchParams.get("candidateId")?.trim() ?? "";

  const [store, workflows, jobsResult, onboardingRecords, policy, flags] = await Promise.all([
    readIngestionStore(),
    getCandidateWorkflowState(),
    fetchBreezyJobs("published"),
    listAllCandidateOnboardingRecords(),
    loadCandidateOnboardingPolicy(),
    loadP73FeatureFlags(),
  ]);

  const candidates = filterMtdCandidates(listIngestedCandidates(store));
  const jobsByPositionId = new Map(
    (jobsResult.ok ? jobsResult.jobs : []).map((job) => [job.jobId, job]),
  );
  const workflowRows = candidates.map((candidate) =>
    buildScoredWorkflowRow(candidate, workflows[candidate.candidateId], {
      job: jobsByPositionId.get(candidate.positionId),
    }),
  );

  const fetchedAt = store.lastChunkAt ?? store.updatedAt ?? new Date().toISOString();
  const started = performance.now();
  const result = runAutonomousCandidateCommunicationPreview({
    candidates: workflowRows,
    onboardingRecords,
    policy,
    flags,
    candidateId: candidateId || null,
    fetchedAt,
  });

  return NextResponse.json({
    ...result,
    meta: { buildMs: Math.round(performance.now() - started) },
  });
}
