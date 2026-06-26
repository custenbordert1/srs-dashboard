import type { BreezyCandidate } from "@/lib/breezy-api";
import type { CandidateOnboardingRecord, CandidateOnboardingPolicy } from "@/lib/candidate-onboarding-engine/types";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { OnboardingSendQueueMetrics } from "@/lib/candidate-onboarding-send-queue/types";
import { buildAutonomousOperationsCenterDashboard } from "@/lib/autonomous-operations-center/build-operations-dashboard";
import { buildAutonomousRecruitingOrchestratorDashboard } from "@/lib/autonomous-recruiting-orchestrator/build-orchestrator-dashboard";
import { buildCandidateOrchestrationSnapshot } from "@/lib/autonomous-recruiting-orchestrator/build-candidate-orchestration";
import type { P71FeatureFlags } from "@/lib/autonomous-paperwork-execution-engine/types";
import type { P73FeatureFlags } from "@/lib/autonomous-candidate-communication-engine/types";
import type { P74FeatureFlags } from "@/lib/autonomous-recruiting-orchestrator/types";
import type { P75FeatureFlags } from "@/lib/autonomous-operations-center/types";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import type { ActiveRep } from "@/lib/rep-intelligence/rep-types";
import { averageConfidence } from "@/lib/autonomous-decision-engine/decision-confidence";
import { generateAutonomousDecisions } from "@/lib/autonomous-decision-engine/decision-rules";
import { averageRiskScore } from "@/lib/autonomous-decision-engine/decision-risk-score";
import { sortDecisionsByValue } from "@/lib/autonomous-decision-engine/decision-priority";
import {
  canExecuteDecisionEngine,
  isPreviewDecisionEngine,
} from "@/lib/autonomous-decision-engine/feature-flags-store";
import type { DecisionDashboardSnapshot, P76FeatureFlags } from "@/lib/autonomous-decision-engine/types";
import { P76_PREVIEW_MODE, P76_SOURCE_PHASE } from "@/lib/autonomous-decision-engine/types";

function buildControls(flags: P76FeatureFlags) {
  return {
    decisionEngineEnabled: flags.decisionEngineEnabled,
    executionMode: flags.executionMode,
    previewMode: flags.previewMode,
    canExecute: canExecuteDecisionEngine(flags),
    previewOnly: isPreviewDecisionEngine(flags),
  };
}

export function buildAutonomousDecisionEngineDashboard(input: {
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
}): DecisionDashboardSnapshot {
  const fetchedAt = input.fetchedAt ?? new Date().toISOString();
  const referenceMs = Date.parse(fetchedAt);

  const sharedInput = {
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
  };

  const [operations, orchestrator] = [
    buildAutonomousOperationsCenterDashboard({ ...sharedInput, p75Flags: input.p75Flags }),
    buildAutonomousRecruitingOrchestratorDashboard(sharedInput),
  ];

  const onboardingByCandidate = new Map(
    input.onboardingRecords.map((record) => [record.candidateId, record] as const),
  );

  const orchestrations = input.workflowRows.map((row) =>
    buildCandidateOrchestrationSnapshot({
      row,
      onboarding: onboardingByCandidate.get(row.candidateId) ?? null,
      policy: input.policy,
      referenceMs,
    }),
  );

  const allDecisions = sortDecisionsByValue(
    generateAutonomousDecisions({
      orchestrations,
      operations,
      orchestrator,
    }),
  );

  const highConfidence = allDecisions.filter((d) => d.confidence >= 80 && !d.blocked);
  const lowConfidence = allDecisions.filter((d) => d.confidence < 65);
  const blockedDecisions = allDecisions.filter((d) => d.blocked);
  const humanApproval = allDecisions.filter((d) => d.humanApprovalRequired);
  const automationReady = allDecisions.filter((d) => d.automationReady);
  const topOpportunities = allDecisions
    .filter((d) => !d.blocked && d.estimatedRecruiterTimeSavedMinutes >= 25)
    .slice(0, 10);
  const biggestRisks = allDecisions
    .filter((d) => d.risk === "critical" || d.risk === "high")
    .slice(0, 10);

  const recruiterMinutesSaved = allDecisions
    .filter((d) => d.automationReady)
    .reduce((sum, d) => sum + d.estimatedRecruiterTimeSavedMinutes, 0);

  const highestValue = topOpportunities[0] ?? allDecisions[0] ?? null;

  const warnings = [
    "Preview mode — decision engine recommends only, no production execution.",
    "No emails, SMS, Dropbox Sign, candidate mutations, workflow changes, or automation execution.",
    "P76 decisions are explainable recommendations — simulate before any future live mode.",
  ];

  if (!input.p76Flags.decisionEngineEnabled) {
    warnings.push("Decision engine is OFF — recommendations computed for preview only.");
  }

  return {
    sourcePhase: P76_SOURCE_PHASE,
    previewMode: P76_PREVIEW_MODE,
    fetchedAt,
    controls: buildControls(input.p76Flags),
    recommendedDecisions: allDecisions.slice(0, 25),
    highConfidenceDecisions: highConfidence.slice(0, 15),
    lowConfidenceDecisions: lowConfidence.slice(0, 15),
    blockedDecisions: blockedDecisions.slice(0, 15),
    humanApprovalRequired: humanApproval.slice(0, 15),
    automationReady: automationReady.slice(0, 15),
    topOpportunities,
    biggestRisks,
    executiveMetrics: {
      totalDecisions: allDecisions.length,
      automationReadyDecisions: automationReady.length,
      humanReviewDecisions: humanApproval.length,
      averageConfidence: averageConfidence(allDecisions.map((d) => d.confidence)),
      averageRiskScore: averageRiskScore(allDecisions.map((d) => d.risk)),
      recruiterHoursSaved: Math.round((recruiterMinutesSaved / 60) * 10) / 10,
      highestValueRecommendation: highestValue?.decision ?? null,
    },
    warnings,
  };
}
