import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { loadP71FeatureFlags } from "@/lib/autonomous-paperwork-execution-engine/feature-flags-store";
import { loadP73FeatureFlags } from "@/lib/autonomous-candidate-communication-engine/feature-flags-store";
import { loadP74FeatureFlags } from "@/lib/autonomous-recruiting-orchestrator/feature-flags-store";
import { loadP75FeatureFlags } from "@/lib/autonomous-operations-center/feature-flags-store";
import { runAutonomousOperationsCenterPreview } from "@/lib/autonomous-operations-center";
import {
  buildOperationsCommandCenterReport,
  type OperationsFilter,
  type OperationsTimeRange,
} from "@/lib/p126-autonomous-operations-command-center";
import { fetchBreezyJobs } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { listIngestedCandidates, readIngestionStore } from "@/lib/candidate-ingestion/ingestion-store";
import { listAllCandidateOnboardingRecords } from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import { loadCandidateOnboardingPolicy } from "@/lib/candidate-onboarding-engine/onboarding-policy-store";
import { buildOnboardingSendQueueMetrics } from "@/lib/candidate-onboarding-send-queue/build-send-queue-metrics";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import { parseMelOpportunities } from "@/lib/mel-matching/mel-opportunity-parser";
import { fetchMelProjectsSheet } from "@/lib/mel-projects-sheet";
import { buildRepIntelligenceWithGeocoding } from "@/lib/rep-intelligence/build-rep-intelligence";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function parsePaperworkTimeRange(value: string | null): OperationsTimeRange {
  if (value === "yesterday" || value === "last7days" || value === "lastHour" || value === "all") {
    return value;
  }
  return "today";
}

/**
 * GET /api/autonomous-operations-center
 *
 * Read-only platform operations monitoring (P75).
 * P126 paperwork command center: ?scope=paperwork
 */
export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter", "dm"],
    requireTerritory: true,
    auditAction: "recruiting_intelligence",
  });
  if (isGuardFailure(guard)) return guard;

  const url = new URL(request.url);
  if (url.searchParams.get("scope") === "paperwork") {
    const filters: OperationsFilter = {
      timeRange: parsePaperworkTimeRange(url.searchParams.get("timeRange")),
      candidateQuery: url.searchParams.get("candidate") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      approvalDecision: url.searchParams.get("approvalDecision") ?? undefined,
      failureReason: url.searchParams.get("failureReason") ?? undefined,
      errorsOnly: url.searchParams.get("errorsOnly") === "true",
    };
    const report = await buildOperationsCommandCenterReport({
      filters,
      refresh: url.searchParams.get("refresh") === "true",
    });
    return NextResponse.json({
      ok: true,
      previewOnly: true,
      scope: "paperwork",
      runner: report.runner,
      queue: report.queue,
      timeline: report.timeline,
      metrics: report.metrics,
      health: report.health,
      candidateSummary: report.candidateSummary,
      failures: report.failures,
      retries: report.retries,
      diagnostics: report.diagnostics,
      filters: report.filters,
      operationsCommandCenter: report,
      executeBatchCalled: false,
    });
  }

  const [store, workflows, jobsResult, melResult, onboardingRecords, policy, p71Flags, p73Flags, p74Flags, p75Flags, sendQueueMetrics] =
    await Promise.all([
      readIngestionStore(),
      getCandidateWorkflowState(),
      fetchBreezyJobs("published"),
      fetchMelProjectsSheet(),
      listAllCandidateOnboardingRecords(),
      loadCandidateOnboardingPolicy(),
      loadP71FeatureFlags(),
      loadP73FeatureFlags(),
      loadP74FeatureFlags(),
      loadP75FeatureFlags(),
      buildOnboardingSendQueueMetrics(),
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

  const opportunities = melResult.ok ? parseMelOpportunities(melResult.rows) : [];
  const repSnapshot = melResult.ok
    ? await buildRepIntelligenceWithGeocoding(melResult.rows, melResult.fetchedAt)
    : null;

  const fetchedAt = store.lastChunkAt ?? store.updatedAt ?? new Date().toISOString();
  const started = performance.now();
  const result = runAutonomousOperationsCenterPreview({
    candidates,
    workflowRows,
    onboardingRecords,
    policy,
    p71Flags,
    p73Flags,
    p74Flags,
    p75Flags,
    sendQueueMetrics,
    opportunities: melResult.ok ? opportunities : undefined,
    activeReps: repSnapshot?.activeReps,
    fetchedAt,
    buildMs: Math.round(performance.now() - started),
  });

  return NextResponse.json({
    ...result,
    meta: { buildMs: Math.round(performance.now() - started), melAvailable: melResult.ok },
  });
}
