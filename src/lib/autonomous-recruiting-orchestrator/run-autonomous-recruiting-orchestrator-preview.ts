import type { BreezyCandidate } from "@/lib/breezy-api";
import type { CandidateOnboardingRecord, CandidateOnboardingPolicy } from "@/lib/candidate-onboarding-engine/types";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { OnboardingSendQueueMetrics } from "@/lib/candidate-onboarding-send-queue/types";
import type { P71FeatureFlags } from "@/lib/autonomous-paperwork-execution-engine/types";
import type { P73FeatureFlags } from "@/lib/autonomous-candidate-communication-engine/types";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import type { ActiveRep } from "@/lib/rep-intelligence/rep-types";
import {
  buildAutonomousRecruitingOrchestratorDashboard,
  buildCandidateOrchestrationPreview,
} from "@/lib/autonomous-recruiting-orchestrator/build-orchestrator-dashboard";
import type {
  AutonomousRecruitingOrchestratorPreviewResult,
  P74FeatureFlags,
} from "@/lib/autonomous-recruiting-orchestrator/types";
import { P74_PREVIEW_MODE } from "@/lib/autonomous-recruiting-orchestrator/types";

export function runAutonomousRecruitingOrchestratorPreview(input: {
  candidates: BreezyCandidate[];
  workflowRows: ScoredCandidateWorkflowRow[];
  onboardingRecords: CandidateOnboardingRecord[];
  policy: CandidateOnboardingPolicy;
  p71Flags: P71FeatureFlags;
  p73Flags: P73FeatureFlags;
  p74Flags: P74FeatureFlags;
  sendQueueMetrics: OnboardingSendQueueMetrics | null;
  opportunities?: MelOpportunity[];
  activeReps?: ActiveRep[];
  candidateId?: string | null;
  fetchedAt?: string;
}): AutonomousRecruitingOrchestratorPreviewResult {
  const fetchedAt = input.fetchedAt ?? new Date().toISOString();
  const dashboard = buildAutonomousRecruitingOrchestratorDashboard({
    candidates: input.candidates,
    workflowRows: input.workflowRows,
    onboardingRecords: input.onboardingRecords,
    policy: input.policy,
    p71Flags: input.p71Flags,
    p73Flags: input.p73Flags,
    p74Flags: input.p74Flags,
    sendQueueMetrics: input.sendQueueMetrics,
    opportunities: input.opportunities,
    activeReps: input.activeReps,
    fetchedAt,
  });

  let candidate = null;
  if (input.candidateId?.trim()) {
    const row = input.workflowRows.find((c) => c.candidateId === input.candidateId?.trim());
    if (row) {
      const onboardingByCandidate = new Map(
        input.onboardingRecords.map((record) => [record.candidateId, record] as const),
      );
      candidate = buildCandidateOrchestrationPreview({
        row,
        onboarding: onboardingByCandidate.get(row.candidateId) ?? null,
        policy: input.policy,
        p73Flags: input.p73Flags,
        p74Flags: input.p74Flags,
        fetchedAt,
      });
    }
  }

  return {
    ok: true,
    previewMode: P74_PREVIEW_MODE,
    fetchedAt,
    dashboard,
    candidate,
    warnings: dashboard.warnings,
  };
}
