import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { fetchBreezyJobs } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { listIngestedCandidates, readIngestionStore } from "@/lib/candidate-ingestion/ingestion-store";
import { listAllCandidateOnboardingRecords } from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import {
  listSupportedExecutiveQueries,
  runExecutiveQueryPreview,
} from "@/lib/executive-natural-language-queries";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/executive-natural-language-queries
 * GET /api/executive-natural-language-queries?q=How many applicants applied today?
 * GET /api/executive-natural-language-queries?list=supported
 *
 * Read-only preview — no writes, automation, or external mutations.
 */
export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter", "dm"],
    requireTerritory: true,
    auditAction: "recruiting_intelligence",
  });
  if (isGuardFailure(guard)) return guard;

  const url = new URL(request.url);
  if (url.searchParams.get("list") === "supported") {
    return NextResponse.json({
      ok: true,
      previewMode: true,
      supportedQuestions: listSupportedExecutiveQueries(),
    });
  }

  const question = url.searchParams.get("q")?.trim() || url.searchParams.get("query")?.trim() || "";

  const [store, workflows, jobsResult, onboardingRecords] = await Promise.all([
    readIngestionStore(),
    getCandidateWorkflowState(),
    fetchBreezyJobs("published"),
    listAllCandidateOnboardingRecords(),
  ]);

  const candidates = listIngestedCandidates(store);
  const jobsByPositionId = new Map(
    (jobsResult.ok ? jobsResult.jobs : []).map((job) => [job.jobId, job]),
  );
  const workflowRows = candidates.map((candidate) =>
    buildScoredWorkflowRow(candidate, workflows[candidate.candidateId], {
      job: jobsByPositionId.get(candidate.positionId),
    }),
  );

  const started = performance.now();
  const result = runExecutiveQueryPreview({
    candidates,
    workflowRows,
    onboardingRecords,
    question: question || null,
    fetchedAt: store.lastChunkAt ?? store.updatedAt ?? new Date().toISOString(),
  });

  return NextResponse.json({
    ...result,
    meta: { buildMs: Math.round(performance.now() - started) },
  });
}
