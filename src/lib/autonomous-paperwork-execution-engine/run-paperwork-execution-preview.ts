import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { CandidateOnboardingRecord, CandidateOnboardingPolicy } from "@/lib/candidate-onboarding-engine/types";
import type { OnboardingSendQueueMetrics } from "@/lib/candidate-onboarding-send-queue/types";
import { buildAutonomousPaperworkExecutionDashboard } from "@/lib/autonomous-paperwork-execution-engine/build-paperwork-execution-dashboard";
import type { P71FeatureFlags } from "@/lib/autonomous-paperwork-execution-engine/types";
import type { AutonomousPaperworkExecutionPreviewResult } from "@/lib/autonomous-paperwork-execution-engine/types";

/**
 * Read-only preview runner — simulates execution without Dropbox Sign, emails, or candidate mutations.
 */
export async function runPaperworkExecutionPreview(input: {
  candidates: ScoredCandidateWorkflowRow[];
  onboardingRecords: CandidateOnboardingRecord[];
  policy: CandidateOnboardingPolicy;
  flags: P71FeatureFlags;
  sendQueueMetrics: OnboardingSendQueueMetrics | null;
  fetchedAt?: string;
}): Promise<AutonomousPaperworkExecutionPreviewResult> {
  const fetchedAt = input.fetchedAt ?? new Date().toISOString();
  const dashboard = await buildAutonomousPaperworkExecutionDashboard({
    candidates: input.candidates,
    onboardingRecords: input.onboardingRecords,
    policy: input.policy,
    flags: input.flags,
    sendQueueMetrics: input.sendQueueMetrics,
    fetchedAt,
  });

  return {
    ok: true,
    previewMode: true,
    fetchedAt,
    dashboard,
    warnings: dashboard.warnings,
  };
}
