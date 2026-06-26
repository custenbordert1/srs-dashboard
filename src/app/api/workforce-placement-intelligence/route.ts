import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { fetchBreezyJobs } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { filterMtdCandidates } from "@/lib/candidate-ingestion/mtd-candidates";
import { listIngestedCandidates, readIngestionStore } from "@/lib/candidate-ingestion/ingestion-store";
import { listAllCandidateOnboardingRecords } from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import { parseMelOpportunities } from "@/lib/mel-matching/mel-opportunity-parser";
import { fetchMelProjectsSheet } from "@/lib/mel-projects-sheet";
import { buildRepIntelligenceWithGeocoding } from "@/lib/rep-intelligence/build-rep-intelligence";
import {
  buildWorkforcePlacementCandidatePreview,
  runWorkforcePlacementPreview,
} from "@/lib/workforce-placement-intelligence";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter", "dm"],
    requireTerritory: true,
    auditAction: "workflow_action",
  });
  if (isGuardFailure(guard)) return guard;

  const url = new URL(request.url);
  const candidateId = url.searchParams.get("candidateId")?.trim() ?? "";

  const [store, workflows, jobsResult, melResult, onboardingRecords] = await Promise.all([
    readIngestionStore(),
    getCandidateWorkflowState(),
    fetchBreezyJobs("published"),
    fetchMelProjectsSheet(),
    listAllCandidateOnboardingRecords(),
  ]);

  if (!melResult.ok) {
    return NextResponse.json({ ok: false, error: melResult.error }, { status: 503 });
  }

  const jobsByPositionId = new Map(
    (jobsResult.ok ? jobsResult.jobs : []).map((job) => [job.jobId, job]),
  );
  const mtd = filterMtdCandidates(listIngestedCandidates(store));
  const scoredRows = mtd.map((candidate) =>
    buildScoredWorkflowRow(candidate, workflows[candidate.candidateId], {
      job: jobsByPositionId.get(candidate.positionId),
    }),
  );

  const opportunities = parseMelOpportunities(melResult.rows);
  const repSnapshot = await buildRepIntelligenceWithGeocoding(melResult.rows, melResult.fetchedAt);
  const onboardingByCandidate = new Map(
    onboardingRecords.map((record) => [record.candidateId, record] as const),
  );

  if (candidateId) {
    const row = scoredRows.find((entry) => entry.candidateId === candidateId) ?? null;
    if (!row) {
      return NextResponse.json({ ok: false, error: "Candidate not found in MTD scope." }, { status: 404 });
    }
    const preview = buildWorkforcePlacementCandidatePreview({
      row,
      opportunities,
      activeReps: repSnapshot.activeReps,
      onboarding: onboardingByCandidate.get(candidateId) ?? null,
    });
    if (!preview) {
      return NextResponse.json(
        { ok: false, error: "Candidate is not Ready For Work — placement preview unavailable." },
        { status: 400 },
      );
    }
    return NextResponse.json({
      ok: true,
      previewMode: true,
      candidate: preview,
      warnings: ["Preview mode — read-only market recommendation, no assignments."],
    });
  }

  const started = performance.now();
  const result = runWorkforcePlacementPreview({
    candidates: scoredRows,
    opportunities,
    activeReps: repSnapshot.activeReps,
    onboardingRecords,
    fetchedAt: melResult.fetchedAt,
  });

  return NextResponse.json({
    ...result,
    meta: { buildMs: Math.round(performance.now() - started) },
  });
}
