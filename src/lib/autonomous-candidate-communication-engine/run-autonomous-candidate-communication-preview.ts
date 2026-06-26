import type { CandidateOnboardingRecord, CandidateOnboardingPolicy } from "@/lib/candidate-onboarding-engine/types";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import {
  buildAutonomousCandidateCommunicationDashboard,
  buildCandidateCommunicationPreview,
} from "@/lib/autonomous-candidate-communication-engine/build-communication-dashboard";
import type {
  AutonomousCandidateCommunicationPreviewResult,
  P73FeatureFlags,
} from "@/lib/autonomous-candidate-communication-engine/types";
import { P73_PREVIEW_MODE } from "@/lib/autonomous-candidate-communication-engine/types";

export function runAutonomousCandidateCommunicationPreview(input: {
  candidates: ScoredCandidateWorkflowRow[];
  onboardingRecords: CandidateOnboardingRecord[];
  policy: CandidateOnboardingPolicy;
  flags: P73FeatureFlags;
  candidateId?: string | null;
  fetchedAt?: string;
}): AutonomousCandidateCommunicationPreviewResult {
  const fetchedAt = input.fetchedAt ?? new Date().toISOString();
  const dashboard = buildAutonomousCandidateCommunicationDashboard({
    candidates: input.candidates,
    onboardingRecords: input.onboardingRecords,
    policy: input.policy,
    flags: input.flags,
    fetchedAt,
  });

  let candidate = null;
  if (input.candidateId?.trim()) {
    const row = input.candidates.find((c) => c.candidateId === input.candidateId?.trim());
    if (row) {
      const onboardingByCandidate = new Map(
        input.onboardingRecords.map((record) => [record.candidateId, record] as const),
      );
      candidate = buildCandidateCommunicationPreview({
        row,
        onboarding: onboardingByCandidate.get(row.candidateId) ?? null,
        policy: input.policy,
        flags: input.flags,
        fetchedAt,
      });
    }
  }

  return {
    ok: true,
    previewMode: P73_PREVIEW_MODE,
    fetchedAt,
    dashboard,
    candidate,
    warnings: dashboard.warnings,
  };
}
