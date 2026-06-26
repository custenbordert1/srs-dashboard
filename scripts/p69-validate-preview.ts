#!/usr/bin/env npx tsx
/**
 * P69 validation — executive natural language queries (preview only).
 */
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { loadP71FeatureFlags } from "@/lib/autonomous-paperwork-execution-engine/feature-flags-store";
import { buildOnboardingSendQueueMetrics } from "@/lib/candidate-onboarding-send-queue/build-send-queue-metrics";
import { listAllCandidateOnboardingRecords } from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import { loadCandidateOnboardingPolicy } from "@/lib/candidate-onboarding-engine/onboarding-policy-store";
import { listIngestedCandidates, readIngestionStore } from "@/lib/candidate-ingestion/ingestion-store";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import {
  listSupportedExecutiveQueries,
  runExecutiveQueryPreview,
} from "@/lib/executive-natural-language-queries";

async function main() {
  const started = Date.now();
  const [store, workflows, onboardingRecords, policy, flags, sendQueueMetrics] = await Promise.all([
    readIngestionStore(),
    getCandidateWorkflowState(),
    listAllCandidateOnboardingRecords(),
    loadCandidateOnboardingPolicy(),
    loadP71FeatureFlags(),
    buildOnboardingSendQueueMetrics(),
  ]);

  const candidates = listIngestedCandidates(store);
  const workflowRows = candidates.map((candidate) =>
    buildScoredWorkflowRow(candidate, workflows[candidate.candidateId]),
  );
  const fetchedAt = store.lastChunkAt ?? store.updatedAt ?? new Date().toISOString();

  const preview = await runExecutiveQueryPreview({
    candidates,
    workflowRows,
    onboardingRecords,
    policy,
    flags,
    sendQueueMetrics,
    fetchedAt,
  });

  const sampleAnswers = await Promise.all(
    listSupportedExecutiveQueries().map(async (definition) => {
      const result = await runExecutiveQueryPreview({
        candidates,
        workflowRows,
        onboardingRecords,
        policy,
        flags,
        sendQueueMetrics,
        question: definition.question,
        fetchedAt,
      });
      return {
        queryId: definition.id,
        question: definition.question,
        summary: result.answer?.summary ?? null,
        total: result.answer?.total ?? null,
      };
    }),
  );

  const report = {
    validatedAt: new Date().toISOString(),
    phase: "P69",
    previewMode: true,
    durationMs: Date.now() - started,
    supportedQuestionCount: preview.dashboard.supportedQuestions.length,
    cards: preview.dashboard.cards.map((card) => ({
      id: card.id,
      title: card.title,
      primaryValue: card.primaryValue,
      lines: card.lines,
      lastRefreshedLabel: card.lastRefreshedLabel,
    })),
    sampleAnswers,
    productionWrites: false,
    automationExecuted: false,
    externalMutations: false,
    warnings: preview.warnings,
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
