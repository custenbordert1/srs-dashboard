#!/usr/bin/env npx tsx
/**
 * P67 validation — read-only preview audit.
 * Does not send emails, write candidate data, or call external mutation APIs.
 */
import { runAutonomousOnboardingPreview } from "@/lib/autonomous-onboarding-engine";
import { buildOnboardingWorkspaceCandidateSnapshot } from "@/lib/autonomous-onboarding-engine/build-onboarding-workspace-snapshot";
import { listAutomationHookDefinitions } from "@/lib/autonomous-onboarding-engine/build-automation-hook-definitions";
import { AUTONOMOUS_ONBOARDING_TRANSITIONS } from "@/lib/autonomous-onboarding-engine/state-machine";
import { listTrainingModules } from "@/lib/autonomous-onboarding-engine/training-module-registry";
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

  const sample =
    preview.dashboard.candidates.find((row) => row.welcomeEmail) ?? preview.dashboard.candidates[0];

  const report = {
    validatedAt: new Date().toISOString(),
    previewMode: true,
    durationMs: Date.now() - started,
    mtdCandidates: mtd.length,
    pipelineCandidates: preview.dashboard.candidates.length,
    stateTransitions: AUTONOMOUS_ONBOARDING_TRANSITIONS.length,
    trainingModules: listTrainingModules().map((row) => row.key),
    automationHooks: listAutomationHookDefinitions().map((row) => row.id),
    kpis: preview.dashboard.kpis,
    warnings: preview.warnings,
    sampleCandidate: sample
      ? {
          candidateId: sample.candidateId,
          name: sample.candidateName,
          state: sample.currentStateLabel,
          readiness: sample.readiness.status,
          welcomeSubject: sample.welcomeEmail?.subject ?? null,
          trainingModules: sample.training.modules.map((row) => ({
            key: row.module.key,
            status: row.status,
          })),
        }
      : null,
    productionWrites: false,
    emailsSent: false,
    dropboxSignCalls: false,
  };

  console.log(JSON.stringify(report, null, 2));

  if (!preview.previewMode) {
    process.exitCode = 1;
    console.error("FAIL: preview mode not enforced");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
