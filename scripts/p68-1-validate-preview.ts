#!/usr/bin/env npx tsx
/**
 * P68.1 validation — market capacity & workforce planning (preview only).
 */
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { listAllCandidateOnboardingRecords } from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import { filterMtdCandidates } from "@/lib/candidate-ingestion/mtd-candidates";
import { listIngestedCandidates, readIngestionStore } from "@/lib/candidate-ingestion/ingestion-store";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import { parseMelOpportunities } from "@/lib/mel-matching/mel-opportunity-parser";
import { fetchMelProjectsSheet } from "@/lib/mel-projects-sheet";
import { buildRepIntelligenceWithGeocoding } from "@/lib/rep-intelligence/build-rep-intelligence";
import { MARKET_CAPACITY_CONFIG, runWorkforcePlacementPreview } from "@/lib/workforce-placement-intelligence";

async function main() {
  const started = Date.now();
  const [store, workflows, melResult, onboardingRecords] = await Promise.all([
    readIngestionStore(),
    getCandidateWorkflowState(),
    fetchMelProjectsSheet(),
    listAllCandidateOnboardingRecords(),
  ]);

  if (!melResult.ok) {
    console.error(JSON.stringify({ ok: false, error: melResult.error }, null, 2));
    process.exitCode = 1;
    return;
  }

  const mtd = filterMtdCandidates(listIngestedCandidates(store));
  const scoredRows = mtd.map((candidate) =>
    buildScoredWorkflowRow(candidate, workflows[candidate.candidateId]),
  );
  const opportunities = parseMelOpportunities(melResult.rows);
  const repSnapshot = await buildRepIntelligenceWithGeocoding(melResult.rows, melResult.fetchedAt);

  const preview = runWorkforcePlacementPreview({
    candidates: scoredRows,
    opportunities,
    activeReps: repSnapshot.activeReps,
    onboardingRecords,
    fetchedAt: melResult.fetchedAt,
  });

  const report = {
    validatedAt: new Date().toISOString(),
    phase: "P68.1",
    previewMode: true,
    durationMs: Date.now() - started,
    capacityConfig: MARKET_CAPACITY_CONFIG,
    workforcePlanningCount: preview.dashboard.workforcePlanning.length,
    planningMetrics: {
      totalRecommendedNewReps: preview.dashboard.metrics.totalRecommendedNewReps,
      understaffedMarketCount: preview.dashboard.metrics.understaffedMarketCount,
      healthyMarketCount: preview.dashboard.metrics.healthyMarketCount,
      marketsNeedingHires: preview.dashboard.metrics.marketsNeedingHires,
    },
    sampleCapacityPlan: preview.dashboard.sampleCapacityPlan,
    topHiringMarkets: preview.dashboard.workforcePlanning
      .filter((row) => row.recommendedNewReps > 0)
      .slice(0, 5)
      .map((row) => ({
        market: row.marketLabel,
        demandScore: row.demandScore,
        openStores: row.openStoreCount,
        activeReps: row.activeRepresentativeCount,
        recommendedNewReps: row.recommendedNewReps,
        status: row.statusLabel,
        reason: row.reason,
      })),
    productionWrites: false,
    assignmentsExecuted: false,
    warnings: preview.warnings,
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
