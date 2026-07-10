import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { fetchBreezyJobs } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { listAllCandidateOnboardingRecords } from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import { listIngestedCandidates, readIngestionStore } from "@/lib/candidate-ingestion/ingestion-store";
import { getCandidateWorkflowBundle } from "@/lib/candidate-workflow-store";
import { getP184DashboardSnapshot } from "@/lib/p184-autonomous-paperwork-send-engine/dashboard";
import {
  loadP184EngineState,
  runP184AutonomousPaperworkSendEngine,
  updateP184Config,
  type P184EngineMode,
} from "@/lib/p184-autonomous-paperwork-send-engine";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

async function loadEngineContext() {
  const state = await loadP184EngineState();
  const store = await readIngestionStore();
  const bundle = await getCandidateWorkflowBundle();
  const jobsResult = await fetchBreezyJobs("published");
  const jobs = jobsResult.ok ? jobsResult.jobs : [];
  const jobsByPositionId = new Map(jobs.map((job) => [job.jobId, job]));
  const candidates = listIngestedCandidates(store).map((candidate) =>
    buildScoredWorkflowRow(candidate, bundle.workflows[candidate.candidateId], {
      job: jobsByPositionId.get(candidate.positionId),
    }),
  );
  const onboardingRecords = await listAllCandidateOnboardingRecords();
  const onboardingByCandidateId = new Map(
    onboardingRecords.map((record) => [record.candidateId, record] as const),
  );
  return { state, candidates, jobsByPositionId, onboardingByCandidateId };
}

/**
 * GET — dashboard metrics + config (no sends, no queue mutation).
 * POST — dry_run / live cycle, or config updates.
 */
export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive"],
    requireTerritory: true,
    auditAction: "workflow_action",
  });
  if (isGuardFailure(guard)) return guard;

  const { state, candidates, jobsByPositionId, onboardingByCandidateId } = await loadEngineContext();
  const snapshot = await getP184DashboardSnapshot({
    candidates,
    onboardingByCandidateId,
    jobsByPositionId,
  });

  return NextResponse.json({
    ok: true,
    config: state.config,
    metrics: snapshot.metrics,
    queueDepth: snapshot.metrics.queueDepth,
    warnings: [
      state.config.enabled
        ? "Engine enabled — live cycles allowed when mode=live."
        : "Engine disabled — dry_run only until enabled via update_config.",
    ],
  });
}

export async function POST(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive"],
    requireTerritory: true,
    auditAction: "workflow_action",
  });
  if (isGuardFailure(guard)) return guard;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action : "run";

  if (action === "update_config") {
    const patch: Record<string, unknown> = {};
    if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
    if (body.mode === "dry_run" || body.mode === "live") patch.mode = body.mode;
    if (typeof body.maxSendsPerCycle === "number") patch.maxSendsPerCycle = body.maxSendsPerCycle;
    if (body.rateLimits && typeof body.rateLimits === "object") {
      patch.rateLimits = body.rateLimits;
    }
    const saved = await updateP184Config(patch as Parameters<typeof updateP184Config>[0]);
    return NextResponse.json({ ok: true, config: saved.config });
  }

  const mode: P184EngineMode =
    body.mode === "live" ? "live" : body.mode === "dry_run" ? "dry_run" : "dry_run";
  const maxSends =
    typeof body.maxSends === "number" && body.maxSends > 0 ? body.maxSends : undefined;

  if (mode === "live") {
    const state = await loadP184EngineState();
    if (!state.config.enabled) {
      return NextResponse.json(
        {
          ok: false,
          error: "P184 live mode blocked — enable the engine via update_config first.",
        },
        { status: 403 },
      );
    }
  }

  const { candidates, jobsByPositionId, onboardingByCandidateId } = await loadEngineContext();
  const result = await runP184AutonomousPaperworkSendEngine({
    candidates,
    onboardingByCandidateId,
    jobsByPositionId,
    mode,
    maxSends,
    byUserId: guard.session.userId,
  });

  return NextResponse.json({
    ok: true,
    result,
    report: result.report,
    metrics: result.metrics,
  });
}
