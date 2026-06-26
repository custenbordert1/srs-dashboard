import type { BreezyCandidate } from "@/lib/breezy-api";
import type { CandidateOnboardingRecord, CandidateOnboardingPolicy } from "@/lib/candidate-onboarding-engine/types";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { OnboardingSendQueueMetrics } from "@/lib/candidate-onboarding-send-queue/types";
import { buildAutonomousApprovalGovernanceDashboard } from "@/lib/autonomous-approval-governance/build-governance-dashboard";
import { buildAutonomousDecisionEngineDashboard } from "@/lib/autonomous-decision-engine/decision-dashboard";
import { buildAutonomousOperationsCenterDashboard } from "@/lib/autonomous-operations-center/build-operations-dashboard";
import { buildAutonomousRecruitingOrchestratorDashboard } from "@/lib/autonomous-recruiting-orchestrator/build-orchestrator-dashboard";
import { buildExecutiveDailyBrief } from "@/lib/executive-daily-brief/build-executive-daily-brief";
import type { P71FeatureFlags } from "@/lib/autonomous-paperwork-execution-engine/types";
import type { P73FeatureFlags } from "@/lib/autonomous-candidate-communication-engine/types";
import type { P74FeatureFlags } from "@/lib/autonomous-recruiting-orchestrator/types";
import type { P75FeatureFlags } from "@/lib/autonomous-operations-center/types";
import type { P76FeatureFlags } from "@/lib/autonomous-decision-engine/types";
import type { P77FeatureFlags } from "@/lib/autonomous-approval-governance/types";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import type { ActiveRep } from "@/lib/rep-intelligence/rep-types";

export type CommandCenterChatContext = {
  fetchedAt: string;
  brief: ReturnType<typeof buildExecutiveDailyBrief>;
  operations: ReturnType<typeof buildAutonomousOperationsCenterDashboard>;
  orchestrator: ReturnType<typeof buildAutonomousRecruitingOrchestratorDashboard>;
  decisions: ReturnType<typeof buildAutonomousDecisionEngineDashboard>;
  governance: ReturnType<typeof buildAutonomousApprovalGovernanceDashboard>;
};

export function buildCommandCenterChatContext(input: {
  candidates: BreezyCandidate[];
  workflowRows: ScoredCandidateWorkflowRow[];
  onboardingRecords: CandidateOnboardingRecord[];
  policy: CandidateOnboardingPolicy;
  p71Flags: P71FeatureFlags;
  p73Flags: P73FeatureFlags;
  p74Flags: P74FeatureFlags;
  p75Flags: P75FeatureFlags;
  p76Flags: P76FeatureFlags;
  p77Flags: P77FeatureFlags;
  sendQueueMetrics: OnboardingSendQueueMetrics | null;
  opportunities?: MelOpportunity[];
  activeReps?: ActiveRep[];
  fetchedAt?: string;
}): CommandCenterChatContext {
  const fetchedAt = input.fetchedAt ?? new Date().toISOString();
  const shared = { ...input, fetchedAt };

  const brief = buildExecutiveDailyBrief({
    candidates: input.candidates,
    workflowRows: input.workflowRows,
    onboardingRecords: input.onboardingRecords,
    policy: input.policy,
    flags: input.p71Flags,
    sendQueueMetrics: input.sendQueueMetrics,
    opportunities: input.opportunities,
    activeReps: input.activeReps,
    fetchedAt,
  });

  const operations = buildAutonomousOperationsCenterDashboard(shared);
  const orchestrator = buildAutonomousRecruitingOrchestratorDashboard(shared);
  const decisions = buildAutonomousDecisionEngineDashboard(shared);
  const governance = buildAutonomousApprovalGovernanceDashboard(shared);

  return { fetchedAt, brief, operations, orchestrator, decisions, governance };
}
