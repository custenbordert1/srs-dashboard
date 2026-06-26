import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { loadP71FeatureFlags } from "@/lib/autonomous-paperwork-execution-engine/feature-flags-store";
import { loadP73FeatureFlags } from "@/lib/autonomous-candidate-communication-engine/feature-flags-store";
import { loadP74FeatureFlags } from "@/lib/autonomous-recruiting-orchestrator/feature-flags-store";
import { loadP75FeatureFlags } from "@/lib/autonomous-operations-center/feature-flags-store";
import { loadP76FeatureFlags } from "@/lib/autonomous-decision-engine/feature-flags-store";
import { loadP77FeatureFlags } from "@/lib/autonomous-approval-governance/feature-flags-store";
import { loadP78FeatureFlags } from "@/lib/ai-command-center/feature-flags-store";
import { processCommandCenterChat } from "@/lib/ai-command-center";
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
 * POST /api/ai-command-center/chat
 * Body: { message: string, sessionId: string }
 */
export async function POST(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter", "dm"],
    requireTerritory: true,
    auditAction: "recruiting_intelligence",
  });
  if (isGuardFailure(guard)) return guard;

  const body = (await request.json()) as { message?: string; sessionId?: string };
  const message = body.message?.trim();
  const sessionId = body.sessionId?.trim();

  if (!message || !sessionId) {
    return NextResponse.json({ ok: false, error: "message and sessionId are required" }, { status: 400 });
  }

  const [store, workflows, jobsResult, melResult, onboardingRecords, policy, p71Flags, p73Flags, p74Flags, p75Flags, p76Flags, p77Flags, p78Flags, sendQueueMetrics] =
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
      loadP77FeatureFlags(),
      loadP78FeatureFlags(),
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

  const result = await processCommandCenterChat({
    message,
    sessionId,
    candidates,
    workflowRows,
    onboardingRecords,
    policy,
    p71Flags,
    p73Flags,
    p74Flags,
    p75Flags,
    p76Flags,
    p77Flags,
    p78Flags,
    sendQueueMetrics,
    opportunities: melResult.ok ? opportunities : undefined,
    activeReps: repSnapshot?.activeReps,
    fetchedAt,
  });

  return NextResponse.json(result);
}
