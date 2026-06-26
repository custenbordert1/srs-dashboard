import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import { buildHumanReviewQueue } from "@/lib/workforce-placement-intelligence/build-human-review-queue";
import {
  buildMarketCapacityPlans,
  buildWorkforcePlanningMetrics,
} from "@/lib/workforce-placement-intelligence/build-market-capacity-plan";
import { buildMarketIntelligenceSnapshot } from "@/lib/workforce-placement-intelligence/build-market-intelligence";
import { buildWorkforceMarketRecommendations } from "@/lib/workforce-placement-intelligence/build-market-recommendation";
import { buildPlacementEligibility } from "@/lib/workforce-placement-intelligence/build-placement-eligibility";
import { listActivePriorityMarketOverrides } from "@/lib/workforce-placement-intelligence/priority-market-overrides";
import type {
  WorkforcePlacementCandidateSnapshot,
  WorkforcePlacementDashboardSnapshot,
} from "@/lib/workforce-placement-intelligence/types";
import { P68_PREVIEW_MODE, P68_SOURCE_PHASE, toPlacementCandidateInput } from "@/lib/workforce-placement-intelligence/types";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import type { ActiveRep } from "@/lib/rep-intelligence/rep-types";

function candidateName(row: ScoredCandidateWorkflowRow): string {
  return `${row.firstName} ${row.lastName}`.trim() || row.email || "Candidate";
}

export function buildWorkforcePlacementDashboardSnapshot(input: {
  candidates: ScoredCandidateWorkflowRow[];
  opportunities: MelOpportunity[];
  activeReps: ActiveRep[];
  onboardingRecords?: CandidateOnboardingRecord[];
  fetchedAt?: string;
}): WorkforcePlacementDashboardSnapshot {
  const fetchedAt = input.fetchedAt ?? new Date().toISOString();
  const referenceMs = Date.parse(fetchedAt);
  const onboardingByCandidate = new Map(
    (input.onboardingRecords ?? []).map((record) => [record.candidateId, record] as const),
  );

  const eligibilityRows = input.candidates.map((row) => {
    const placementRow = toPlacementCandidateInput(row);
    return {
      row,
      placementRow,
      eligibility: buildPlacementEligibility({
        row: placementRow,
        onboarding: onboardingByCandidate.get(row.candidateId) ?? null,
      }),
    };
  });

  const readyRows = eligibilityRows.filter((entry) => entry.eligibility.readyForWork);
  const eligibleRows = eligibilityRows.filter((entry) => entry.eligibility.status === "eligible");

  const { recommendations, markets } = buildWorkforceMarketRecommendations({
    candidates: eligibleRows.map((entry) => ({
      row: entry.placementRow,
      eligibility: entry.eligibility,
    })),
    opportunities: input.opportunities,
    activeReps: input.activeReps,
  });

  const { recommendedMarkets, averageMarketDemand } = buildMarketIntelligenceSnapshot({
    opportunities: input.opportunities,
    activeReps: input.activeReps,
    referenceMs,
  });

  const humanReviewQueue = buildHumanReviewQueue({
    candidates: input.candidates,
    onboardingByCandidate,
  });

  const readyForWorkCandidates: WorkforcePlacementCandidateSnapshot[] = readyRows.map((entry) => {
    const recommendation =
      recommendations.find((row) => row.candidateId === entry.row.candidateId) ?? null;
    return {
      candidateId: entry.row.candidateId,
      candidateName: candidateName(entry.row),
      email: entry.row.email?.trim() || null,
      city: entry.row.city ?? "",
      state: entry.row.state ?? "",
      previewMode: P68_PREVIEW_MODE,
      readyForWork: true,
      eligibility: entry.eligibility,
      recommendation,
      humanReviewRequired: entry.eligibility.status === "human_review",
    };
  });

  const workforcePlanning = buildMarketCapacityPlans(markets);
  const planningMetrics = buildWorkforcePlanningMetrics(workforcePlanning);
  const sampleCapacityPlan =
    workforcePlanning.find((row) => row.recommendedNewReps > 0) ?? workforcePlanning[0] ?? null;

  const sampleRecommendation = recommendations[0] ?? null;
  const sampleCandidateId = sampleRecommendation?.candidateId ?? readyForWorkCandidates[0]?.candidateId ?? null;

  return {
    previewMode: P68_PREVIEW_MODE,
    sourcePhase: P68_SOURCE_PHASE,
    fetchedAt,
    pipelineStage: "workforce_placement_intelligence",
    coverageOpportunities: markets.slice(0, 25),
    recommendedMarkets,
    priorityMarkets: listActivePriorityMarketOverrides(referenceMs),
    readyForWorkCandidates,
    humanReviewQueue,
    recommendations,
    workforcePlanning,
    sampleCapacityPlan,
    metrics: {
      totalReadyForWork: readyRows.length,
      eligibleForPlacement: eligibleRows.length,
      humanReviewCount: humanReviewQueue.length,
      candidatesAwaitingPlacement: readyRows.length - recommendations.length,
      averageMarketDemand,
      recommendedMarketCount: recommendedMarkets.length,
      priorityMarketCount: listActivePriorityMarketOverrides(referenceMs).length,
      totalRecommendedNewReps: planningMetrics.totalRecommendedNewReps,
      understaffedMarketCount: planningMetrics.understaffedMarketCount,
      healthyMarketCount: planningMetrics.healthyMarketCount,
      watchMarketCount: planningMetrics.watchMarketCount,
      marketsNeedingHires: planningMetrics.marketsNeedingHires,
    },
    sampleCandidateId,
    sampleRecommendation,
  };
}
