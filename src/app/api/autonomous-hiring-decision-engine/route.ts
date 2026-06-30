import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import {
  DEFAULT_P87_FEATURE_FLAGS,
  loadP87FeatureFlags,
  refreshHiringDecisionPreview,
  runHiringDecisionSimulation,
  saveP87FeatureFlags,
  validateHiringDecisionQueues,
} from "@/lib/autonomous-hiring-decision-engine";
import type { P87FeatureFlags } from "@/lib/autonomous-hiring-decision-engine";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { listAllCandidateOnboardingRecords } from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import {
  currentMtdDateRange,
  filterMtdCandidates,
  listIngestedCandidates,
  readIngestionStore,
} from "@/lib/candidate-ingestion";
import { getCandidateWorkflowBundle } from "@/lib/candidate-workflow-store";
import { fetchBreezyJobs } from "@/lib/breezy-api";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * GET /api/autonomous-hiring-decision-engine
 * Read-only P87 hiring recommendations (preview only).
 */
export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter", "dm"],
    requireTerritory: true,
    auditAction: "recruiting_intelligence",
  });
  if (isGuardFailure(guard)) return guard;

  const url = new URL(request.url);
  const mtdOnly = url.searchParams.get("mtdOnly") !== "false";

  const [flags, store, bundle, jobsResult, onboardingRecords] = await Promise.all([
    loadP87FeatureFlags(),
    readIngestionStore(),
    getCandidateWorkflowBundle(),
    fetchBreezyJobs("published"),
    listAllCandidateOnboardingRecords(),
  ]);

  const jobs = jobsResult.ok ? jobsResult.jobs : [];
  const jobsByPositionId = new Map(jobs.map((job) => [job.jobId, job]));
  const candidates = mtdOnly
    ? filterMtdCandidates(listIngestedCandidates(store))
    : listIngestedCandidates(store);
  const rows = candidates.map((candidate) =>
    buildScoredWorkflowRow(candidate, bundle.workflows[candidate.candidateId], {
      job: jobsByPositionId.get(candidate.positionId),
    }),
  );
  const onboardingByCandidateId = new Map(
    onboardingRecords.map((record) => [record.candidateId, record]),
  );
  const range = currentMtdDateRange();
  const simulation = runHiringDecisionSimulation({
    rows,
    jobsByPositionId,
    onboardingByCandidateId,
    mtdRangeLabel: `${range.start}..${range.end}`,
  });
  const validation = validateHiringDecisionQueues(simulation.decisions);

  return NextResponse.json({
    ok: true,
    previewMode: true,
    flags,
    simulation,
    validation,
    warnings: [
      "Preview only — no workflow status changes and no paperwork sends.",
      flags.previewMode ? "P87 preview mode active." : "P87 preview mode off (still read-only on this route).",
      validation.ok ? null : `Validation issues: ${validation.errors.join("; ")}`,
    ].filter(Boolean),
  });
}

/**
 * POST — update P87 feature flags only (never executes live hiring actions).
 */
export async function POST(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive"],
    requireTerritory: true,
    auditAction: "workflow_action",
  });
  if (isGuardFailure(guard)) return guard;

  const body = (await request.json().catch(() => ({}))) as Partial<P87FeatureFlags>;
  const current = await loadP87FeatureFlags();
  const next: P87FeatureFlags = {
    ...current,
    ...body,
    previewMode: body.previewMode ?? current.previewMode ?? true,
    updatedAt: new Date().toISOString(),
  };
  const saved = await saveP87FeatureFlags(next);

  if (saved.refreshOnIngestion) {
    const store = await readIngestionStore();
    const bundle = await getCandidateWorkflowBundle();
    const jobsResult = await fetchBreezyJobs("published");
    const jobsByPositionId = new Map(
      (jobsResult.ok ? jobsResult.jobs : []).map((job) => [job.jobId, job]),
    );
    const rows = filterMtdCandidates(listIngestedCandidates(store)).map((candidate) =>
      buildScoredWorkflowRow(candidate, bundle.workflows[candidate.candidateId], {
        job: jobsByPositionId.get(candidate.positionId),
      }),
    );
    const onboardingRecords = await listAllCandidateOnboardingRecords();
    await refreshHiringDecisionPreview({
      rows,
      jobsByPositionId,
      onboardingRecords,
      persist: true,
    });
  }

  return NextResponse.json({
    ok: true,
    flags: saved,
    defaults: DEFAULT_P87_FEATURE_FLAGS,
    warnings: ["Flags updated — hiring decisions remain preview-only until P88 live gates pass."],
  });
}
