import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { loadP71FeatureFlags } from "@/lib/autonomous-paperwork-execution-engine/feature-flags-store";
import { loadP73FeatureFlags } from "@/lib/autonomous-candidate-communication-engine/feature-flags-store";
import { loadP74FeatureFlags } from "@/lib/autonomous-recruiting-orchestrator/feature-flags-store";
import { loadP75FeatureFlags } from "@/lib/autonomous-operations-center/feature-flags-store";
import { loadP76FeatureFlags } from "@/lib/autonomous-decision-engine/feature-flags-store";
import { runAutonomousDecisionEnginePreview } from "@/lib/autonomous-decision-engine";
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
export const maxDuration = 120;

/**
 * GET /api/autonomous-decision-engine
 * GET /api/autonomous-decision-engine?simulate=decisionId
 *
 * Read-only autonomous decision recommendations (P76).
 */
export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter", "dm"],
    requireTerritory: true,
    auditAction: "recruiting_intelligence",
  });
  if (isGuardFailure(guard)) return guard;

  const url = new URL(request.url);
  const simulateId = url.searchParams.get("simulate")?.trim() || null;

  const [store, workflows, jobsResult, melResult, onboardingRecords, policy, p71Flags, p73Flags, p74Flags, p75Flags, p76Flags, sendQueueMetrics] =
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
      loadP76FeatureFlags(),
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
  const result = runAutonomousDecisionEnginePreview({
    candidates,
    workflowRows,
    onboardingRecords,
    policy,
    p71Flags,
    p73Flags,
    p74Flags,
    p75Flags,
    p76Flags,
    sendQueueMetrics,
    opportunities: melResult.ok ? opportunities : undefined,
    activeReps: repSnapshot?.activeReps,
    fetchedAt,
  });

  let simulation = null;
  if (simulateId) {
    const { simulateDecisionById } = await import("@/lib/autonomous-decision-engine/decision-preview");
    const allDecisions = [
      ...result.dashboard.recommendedDecisions,
      ...result.dashboard.automationReady,
      ...result.dashboard.blockedDecisions,
    ];
    simulation = simulateDecisionById(allDecisions, simulateId);
  }

  return NextResponse.json({
    ...result,
    simulation,
    meta: { buildMs: Math.round(performance.now() - started), melAvailable: melResult.ok },
  });
}
