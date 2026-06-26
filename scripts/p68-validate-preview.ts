#!/usr/bin/env npx tsx
/**
 * P68 validation — workforce placement intelligence (preview only).
 */
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { listAllCandidateOnboardingRecords } from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import { filterMtdCandidates } from "@/lib/candidate-ingestion/mtd-candidates";
import { listIngestedCandidates, readIngestionStore } from "@/lib/candidate-ingestion/ingestion-store";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import { parseMelOpportunities } from "@/lib/mel-matching/mel-opportunity-parser";
import { fetchMelProjectsSheet } from "@/lib/mel-projects-sheet";
import { buildRepIntelligenceWithGeocoding } from "@/lib/rep-intelligence/build-rep-intelligence";
import { runWorkforcePlacementPreview } from "@/lib/workforce-placement-intelligence";

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
    phase: "P68",
    previewMode: true,
    durationMs: Date.now() - started,
    mtdCandidates: mtd.length,
    marketCount: preview.dashboard.coverageOpportunities.length,
    metrics: preview.dashboard.metrics,
    priorityMarkets: preview.dashboard.priorityMarkets.map((row) => row.marketLabel),
    humanReviewCount: preview.dashboard.humanReviewQueue.length,
    recommendationCount: preview.dashboard.recommendations.length,
    sampleRecommendation: preview.dashboard.sampleRecommendation,
    productionWrites: false,
    assignmentsExecuted: false,
    notificationsSent: false,
    melUpdated: false,
    automationExecuted: false,
    warnings: preview.warnings,
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
