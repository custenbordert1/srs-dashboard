import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { buildP84DashboardMetrics } from "@/lib/autonomous-paperwork-send-engine/build-p84-dashboard-metrics";
import {
  DEFAULT_P84_FEATURE_FLAGS,
  loadP84FeatureFlags,
  saveP84FeatureFlags,
} from "@/lib/autonomous-paperwork-send-engine/feature-flags-store";
import type { P84FeatureFlags } from "@/lib/autonomous-paperwork-send-engine/types";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { listAllCandidateOnboardingRecords } from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import { listIngestedCandidates, readIngestionStore } from "@/lib/candidate-ingestion/ingestion-store";
import { getCandidateWorkflowBundle } from "@/lib/candidate-workflow-store";
import { fetchBreezyJobs } from "@/lib/breezy-api";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET — read P84 flags and dashboard metrics (no sends).
 * POST — update flags only; never triggers Dropbox Sign or live sends from this route.
 */
export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive"],
    requireTerritory: true,
    auditAction: "workflow_action",
  });
  if (isGuardFailure(guard)) return guard;

  const flags = await loadP84FeatureFlags();
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
  const metrics = await buildP84DashboardMetrics({
    candidates,
    onboardingRecords,
    flags,
  });

  return NextResponse.json({
    ok: true,
    flags,
    defaults: DEFAULT_P84_FEATURE_FLAGS,
    metrics,
    warnings: [
      "POST updates flags only — no packets sent from this endpoint.",
      flags.liveSend && flags.liveMode
        ? "Live send enabled — verify safeguards before orchestrator runs."
        : "Live send disabled — orchestrator will audit/simulate only.",
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

  const current = await loadP84FeatureFlags();
  const next: P84FeatureFlags = { ...current };

  if (typeof body.enabled === "boolean") next.enabled = body.enabled;
  if (typeof body.liveMode === "boolean") next.liveMode = body.liveMode;
  if (typeof body.liveSend === "boolean") next.liveSend = body.liveSend;
  if (typeof body.requireApproval === "boolean") next.requireApproval = body.requireApproval;
  if (typeof body.monitorSignatures === "boolean") next.monitorSignatures = body.monitorSignatures;

  const maxSends = Number.parseInt(String(body.maxSendsPerRun ?? ""), 10);
  if (Number.isFinite(maxSends) && maxSends > 0) next.maxSendsPerRun = maxSends;

  const saved = await saveP84FeatureFlags(next);

  return NextResponse.json({
    ok: true,
    flags: saved,
    warnings: ["Flag update saved — no packets sent from this endpoint."],
  });
}
