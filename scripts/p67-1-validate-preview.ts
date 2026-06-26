#!/usr/bin/env npx tsx
/**
 * P67.1 validation — progress & activity intelligence (preview only).
 */
import { runAutonomousOnboardingPreview } from "@/lib/autonomous-onboarding-engine";
import { listOnboardingProgressStepDefinitions } from "@/lib/autonomous-onboarding-engine/onboarding-progress-registry";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { listAllCandidateOnboardingRecords } from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import { filterMtdCandidates } from "@/lib/candidate-ingestion/mtd-candidates";
import { listIngestedCandidates, readIngestionStore } from "@/lib/candidate-ingestion/ingestion-store";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";

async function main() {
  const started = Date.now();
  const [store, workflows, onboardingRecords] = await Promise.all([
    readIngestionStore(),
    getCandidateWorkflowState(),
    listAllCandidateOnboardingRecords(),
  ]);

  const mtd = filterMtdCandidates(listIngestedCandidates(store));
  const scoredRows = mtd.map((candidate) =>
    buildScoredWorkflowRow(candidate, workflows[candidate.candidateId]),
  );

  const preview = runAutonomousOnboardingPreview({
    candidates: scoredRows,
    onboardingRecords,
  });

  const sample = preview.dashboard.candidates[0] ?? null;

  const report = {
    validatedAt: new Date().toISOString(),
    phase: "P67.1",
    previewMode: true,
    durationMs: Date.now() - started,
    progressStepCount: listOnboardingProgressStepDefinitions().length,
    mtdCandidates: mtd.length,
    pipelineCandidates: preview.dashboard.candidates.length,
    progressMetrics: preview.dashboard.progressMetrics,
    stalledCount: preview.dashboard.stalledCandidates.length,
    sampleCandidate: sample
      ? {
          candidateId: sample.candidateId,
          name: sample.candidateName,
          progressPercent: sample.progress.progressPercent,
          progressBar: sample.progress.progressBar,
          completedSteps: `${sample.progress.completedCount}/${sample.progress.totalSteps}`,
          lastActivity: sample.lastActivity,
          stall: sample.stall,
          nextStep: sample.nextStepLabel,
          timelineEntries: sample.activityTimeline.length,
        }
      : null,
    productionWrites: false,
    emailsSent: false,
    automationExecuted: false,
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
