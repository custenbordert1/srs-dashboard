import type { BreezyCandidate } from "@/lib/breezy-api";
import type { CandidateOnboardingRecord, CandidateOnboardingPolicy } from "@/lib/candidate-onboarding-engine/types";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { OnboardingSendQueueMetrics } from "@/lib/candidate-onboarding-send-queue/types";
import type { P71FeatureFlags } from "@/lib/autonomous-paperwork-execution-engine/types";
import type { P73FeatureFlags } from "@/lib/autonomous-candidate-communication-engine/types";
import type { P74FeatureFlags } from "@/lib/autonomous-recruiting-orchestrator/types";
import type { P75FeatureFlags } from "@/lib/autonomous-operations-center/types";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import type { ActiveRep } from "@/lib/rep-intelligence/rep-types";
import { buildAutonomousDecisionEngineDashboard } from "@/lib/autonomous-decision-engine/decision-dashboard";
import type { AutonomousDecisionEnginePreviewResult, P76FeatureFlags } from "@/lib/autonomous-decision-engine/types";
import { P76_PREVIEW_MODE } from "@/lib/autonomous-decision-engine/types";

export function runAutonomousDecisionEnginePreview(input: {
  candidates: BreezyCandidate[];
  workflowRows: ScoredCandidateWorkflowRow[];
  onboardingRecords: CandidateOnboardingRecord[];
  policy: CandidateOnboardingPolicy;
  p71Flags: P71FeatureFlags;
  p73Flags: P73FeatureFlags;
  p74Flags: P74FeatureFlags;
  p75Flags: P75FeatureFlags;
  p76Flags: P76FeatureFlags;
  sendQueueMetrics: OnboardingSendQueueMetrics | null;
  opportunities?: MelOpportunity[];
  activeReps?: ActiveRep[];
  fetchedAt?: string;
}): AutonomousDecisionEnginePreviewResult {
  const fetchedAt = input.fetchedAt ?? new Date().toISOString();
  const dashboard = buildAutonomousDecisionEngineDashboard({ ...input, fetchedAt });

  return {
    ok: true,
    previewMode: P76_PREVIEW_MODE,
    fetchedAt,
    dashboard,
    warnings: dashboard.warnings,
  };
}
