import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { fetchBreezyJobs } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { filterMtdCandidates } from "@/lib/candidate-ingestion/mtd-candidates";
import { listIngestedCandidates, readIngestionStore } from "@/lib/candidate-ingestion/ingestion-store";
import { listAllCandidateOnboardingRecords } from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import {
  buildOnboardingPipelineCandidatePreview,
  runOnboardingPipelinePreview,
} from "@/lib/onboarding-pipeline-engine";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter", "dm"],
    requireTerritory: true,
    auditAction: "workflow_action",
  });
  if (isGuardFailure(guard)) return guard;

  const url = new URL(request.url);
  const candidateId = url.searchParams.get("candidateId")?.trim() ?? "";

  const [store, workflows, jobsResult, onboardingRecords] = await Promise.all([
    readIngestionStore(),
    getCandidateWorkflowState(),
    fetchBreezyJobs("published"),
    listAllCandidateOnboardingRecords(),
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

  const onboardingByCandidate = new Map(
    onboardingRecords.map((record) => [record.candidateId, record] as const),
  );

  if (candidateId) {
    const row = scoredRows.find((entry) => entry.candidateId === candidateId) ?? null;
    if (!row) {
      return NextResponse.json({ ok: false, error: "Candidate not found in MTD scope." }, { status: 404 });
    }
    const record = buildOnboardingPipelineCandidatePreview({
      row,
      onboarding: onboardingByCandidate.get(candidateId) ?? null,
    });
    if (!record) {
      return NextResponse.json(
        { ok: false, error: "Candidate paperwork is not complete — not in P80 onboarding pipeline." },
        { status: 400 },
      );
    }
    return NextResponse.json({
      ok: true,
      previewMode: true,
      record,
      warnings: ["Preview mode — read-only, no production writes."],
    });
  }

  const started = performance.now();
  const result = runOnboardingPipelinePreview({
    candidates: scoredRows,
    onboardingRecords,
  });

  return NextResponse.json({
    ...result,
    meta: { buildMs: Math.round(performance.now() - started) },
  });
}
