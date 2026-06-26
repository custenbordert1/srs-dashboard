import type { BreezyCandidate } from "@/lib/breezy-api";
import type { CandidateOnboardingRecord, CandidateOnboardingPolicy } from "@/lib/candidate-onboarding-engine/types";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { OnboardingSendQueueMetrics } from "@/lib/candidate-onboarding-send-queue/types";
import { generateAutonomousDecisions } from "@/lib/autonomous-decision-engine/decision-rules";
import { sortDecisionsByValue } from "@/lib/autonomous-decision-engine/decision-priority";
import { buildAutonomousOperationsCenterDashboard } from "@/lib/autonomous-operations-center/build-operations-dashboard";
import { buildAutonomousRecruitingOrchestratorDashboard } from "@/lib/autonomous-recruiting-orchestrator/build-orchestrator-dashboard";
import { buildCandidateOrchestrationSnapshot } from "@/lib/autonomous-recruiting-orchestrator/build-candidate-orchestration";
import type { P71FeatureFlags } from "@/lib/autonomous-paperwork-execution-engine/types";
import type { P73FeatureFlags } from "@/lib/autonomous-candidate-communication-engine/types";
import type { P74FeatureFlags } from "@/lib/autonomous-recruiting-orchestrator/types";
import type { P75FeatureFlags } from "@/lib/autonomous-operations-center/types";
import type { P76FeatureFlags } from "@/lib/autonomous-decision-engine/types";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import type { ActiveRep } from "@/lib/rep-intelligence/rep-types";
import { buildApprovalQueue } from "@/lib/autonomous-approval-governance/build-approval-queue";
import { evaluateGovernanceForDecisions } from "@/lib/autonomous-approval-governance/evaluate-governance-rules";
import {
  canExecuteGovernance,
  isPreviewGovernance,
} from "@/lib/autonomous-approval-governance/feature-flags-store";
import { GOVERNANCE_POLICIES } from "@/lib/autonomous-approval-governance/policy-registry";
import type { GovernanceDashboardSnapshot, P77FeatureFlags } from "@/lib/autonomous-approval-governance/types";
import { P77_PREVIEW_MODE, P77_SOURCE_PHASE } from "@/lib/autonomous-approval-governance/types";
import { averageConfidence } from "@/lib/autonomous-decision-engine/decision-confidence";
import { averageRiskScore } from "@/lib/autonomous-decision-engine/decision-risk-score";

function buildControls(flags: P77FeatureFlags) {
  return {
    governanceEnabled: flags.governanceEnabled,
    executionMode: flags.executionMode,
    previewMode: flags.previewMode,
    canExecute: canExecuteGovernance(flags),
    previewOnly: isPreviewGovernance(flags),
  };
}

function buildGovernanceHealth(governed: ReturnType<typeof evaluateGovernanceForDecisions>): GovernanceDashboardSnapshot["governanceHealth"] {
  const total = governed.length;
  if (total === 0) {
    return { status: "healthy", autoApprovalRate: null, blockedRate: null, summary: "No decisions to govern." };
  }
  const autoApproved = governed.filter((d) => d.approvalLevel === "auto_approved").length;
  const blocked = governed.filter((d) => d.approvalLevel === "blocked").length;
  const autoApprovalRate = Math.round((autoApproved / total) * 100);
  const blockedRate = Math.round((blocked / total) * 100);
  const status = blockedRate > 40 ? "critical" : blockedRate > 20 || autoApprovalRate < 10 ? "warning" : "healthy";
  return {
    status,
    autoApprovalRate,
    blockedRate,
    summary: `${autoApproved} auto-approved, ${blocked} blocked, ${total - autoApproved - blocked} awaiting approval of ${total} decisions.`,
  };
}

export function buildAutonomousApprovalGovernanceDashboard(input: {
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
}): GovernanceDashboardSnapshot {
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
    generateAutonomousDecisions({ orchestrations, operations, orchestrator }),
  );

  const governed = evaluateGovernanceForDecisions({
    decisions: allDecisions,
    workflowRows: input.workflowRows,
    p71Flags: input.p71Flags,
    p73Flags: input.p73Flags,
    p77Flags: input.p77Flags,
  });

  const autoApprovedDecisions = governed.filter((d) => d.approvalLevel === "auto_approved");
  const approvalRequired = governed.filter(
    (d) =>
      d.approvalLevel === "recruiter_approval_required" ||
      d.approvalLevel === "dm_approval_required" ||
      d.approvalLevel === "executive_approval_required",
  );
  const blockedByPolicy = governed.filter((d) => d.approvalLevel === "blocked");
  const highRiskDecisions = governed.filter((d) => d.risk === "high" || d.risk === "critical");
  const pilotEligibleDecisions = governed.filter((d) => d.pilotEligible);
  const policyExceptions = governed.filter(
    (d) => d.blockingRules.length > 0 && d.approvalLevel !== "blocked",
  );

  const approvalQueue = buildApprovalQueue(governed);
  const governanceHealth = buildGovernanceHealth(governed);

  const timeSaved = autoApprovedDecisions.reduce((sum, d) => sum + d.estimatedRecruiterTimeSavedMinutes, 0);

  const warnings = [
    "Preview mode — governance evaluates permissions only, no approval mutations or execution.",
    "No emails, SMS, Dropbox Sign, candidate mutations, workflow changes, or automation execution.",
    "P77 approval queue is read-only — approve/deny actions are not yet implemented.",
  ];

  if (!input.p77Flags.governanceEnabled) {
    warnings.push("Governance engine is OFF — evaluations computed for preview only.");
  }

  return {
    sourcePhase: P77_SOURCE_PHASE,
    previewMode: P77_PREVIEW_MODE,
    fetchedAt,
    controls: buildControls(input.p77Flags),
    policies: GOVERNANCE_POLICIES,
    autoApprovedDecisions: autoApprovedDecisions.slice(0, 15),
    approvalRequired: approvalRequired.slice(0, 20),
    blockedByPolicy: blockedByPolicy.slice(0, 15),
    highRiskDecisions: highRiskDecisions.slice(0, 15),
    pilotEligibleDecisions: pilotEligibleDecisions.slice(0, 15),
    policyExceptions: policyExceptions.slice(0, 10),
    approvalQueue: approvalQueue.slice(0, 25),
    governanceHealth,
    executiveMetrics: {
      totalDecisionsReviewed: governed.length,
      autoApproved: autoApprovedDecisions.length,
      recruiterApprovalRequired: governed.filter((d) => d.approvalLevel === "recruiter_approval_required").length,
      dmApprovalRequired: governed.filter((d) => d.approvalLevel === "dm_approval_required").length,
      executiveApprovalRequired: governed.filter((d) => d.approvalLevel === "executive_approval_required").length,
      blockedByPolicy: blockedByPolicy.length,
      averageConfidence: averageConfidence(governed.map((d) => d.confidence)),
      averageRiskScore: averageRiskScore(governed.map((d) => d.risk)),
      estimatedRecruiterTimeSaved: Math.round((timeSaved / 60) * 10) / 10,
      pilotEligibleActions: pilotEligibleDecisions.length,
    },
    warnings,
  };
}
