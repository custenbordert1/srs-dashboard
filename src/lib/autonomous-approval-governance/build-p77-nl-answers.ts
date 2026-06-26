import type { BreezyCandidate } from "@/lib/breezy-api";
import type { CandidateOnboardingRecord, CandidateOnboardingPolicy } from "@/lib/candidate-onboarding-engine/types";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { OnboardingSendQueueMetrics } from "@/lib/candidate-onboarding-send-queue/types";
import type { P71FeatureFlags } from "@/lib/autonomous-paperwork-execution-engine/types";
import type { P73FeatureFlags } from "@/lib/autonomous-candidate-communication-engine/types";
import type { P74FeatureFlags } from "@/lib/autonomous-recruiting-orchestrator/types";
import type { P75FeatureFlags } from "@/lib/autonomous-operations-center/types";
import type { P76FeatureFlags } from "@/lib/autonomous-decision-engine/types";
import type { P77FeatureFlags } from "@/lib/autonomous-approval-governance/types";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import type { ActiveRep } from "@/lib/rep-intelligence/rep-types";
import { buildAutonomousApprovalGovernanceDashboard } from "@/lib/autonomous-approval-governance/build-governance-dashboard";
import type { ExecutiveQueryAnswer, ExecutiveQueryId } from "@/lib/executive-natural-language-queries/types";
import { P69_PREVIEW_MODE } from "@/lib/executive-natural-language-queries/types";
import { getSupportedExecutiveQuery } from "@/lib/executive-natural-language-queries/query-registry";

const P77_GOVERNANCE_QUERY_IDS = new Set<ExecutiveQueryId>([
  "governance_auto_allowed",
  "governance_requires_approval",
  "governance_blocked",
  "governance_why_not_automated",
  "governance_pilot_eligible",
  "governance_safe_to_approve",
  "governance_executive_approval",
  "governance_blocking_rules",
]);

export function isP77GovernanceQueryId(queryId: ExecutiveQueryId): boolean {
  return P77_GOVERNANCE_QUERY_IDS.has(queryId);
}

export function buildP77NlAnswers(input: {
  queryId: ExecutiveQueryId;
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
  fetchedAt: string;
}): ExecutiveQueryAnswer | null {
  if (!isP77GovernanceQueryId(input.queryId)) return null;

  const definition = getSupportedExecutiveQuery(input.queryId);
  if (!definition) return null;

  const dashboard = buildAutonomousApprovalGovernanceDashboard({
    candidates: input.candidates,
    workflowRows: input.workflowRows,
    onboardingRecords: input.onboardingRecords,
    policy: input.policy,
    p71Flags: input.p71Flags,
    p73Flags: input.p73Flags,
    p74Flags: input.p74Flags,
    p75Flags: input.p75Flags,
    p76Flags: input.p76Flags,
    p77Flags: input.p77Flags,
    sendQueueMetrics: input.sendQueueMetrics,
    opportunities: input.opportunities,
    activeReps: input.activeReps,
    fetchedAt: input.fetchedAt,
  });

  const sourceSystem = "Autonomous Approval & Governance Engine (P77)";
  const metrics = dashboard.executiveMetrics;

  switch (input.queryId) {
    case "governance_auto_allowed": {
      const count = metrics.autoApproved;
      const sample = dashboard.autoApprovedDecisions[0]?.decision;
      return {
        queryId: input.queryId,
        question: definition.question,
        category: "governance",
        previewMode: P69_PREVIEW_MODE,
        sourceSystem,
        lastRefreshedAt: input.fetchedAt,
        total: count,
        metrics: { autoApproved: count },
        comparison: null,
        summary:
          count > 0
            ? `${count} decision${count === 1 ? "" : "s"} auto-approved by policy${sample ? ` — e.g. ${sample}` : ""}.`
            : "No decisions currently pass auto-approval governance in preview.",
      };
    }
    case "governance_requires_approval": {
      const total =
        metrics.recruiterApprovalRequired + metrics.dmApprovalRequired + metrics.executiveApprovalRequired;
      return {
        queryId: input.queryId,
        question: definition.question,
        category: "governance",
        previewMode: P69_PREVIEW_MODE,
        sourceSystem,
        lastRefreshedAt: input.fetchedAt,
        total,
        metrics: { approvalQueue: dashboard.approvalQueue.length },
        comparison: null,
        summary: `${total} decision${total === 1 ? "" : "s"} require human approval (${metrics.recruiterApprovalRequired} recruiter, ${metrics.dmApprovalRequired} DM, ${metrics.executiveApprovalRequired} executive).`,
      };
    }
    case "governance_blocked": {
      return {
        queryId: input.queryId,
        question: definition.question,
        category: "governance",
        previewMode: P69_PREVIEW_MODE,
        sourceSystem,
        lastRefreshedAt: input.fetchedAt,
        total: metrics.blockedByPolicy,
        metrics: { blocked: metrics.blockedByPolicy },
        comparison: null,
        summary:
          metrics.blockedByPolicy > 0
            ? `${metrics.blockedByPolicy} decision${metrics.blockedByPolicy === 1 ? "" : "s"} blocked by governance policy.`
            : "No decisions currently blocked by policy.",
      };
    }
    case "governance_why_not_automated": {
      const top = dashboard.approvalRequired[0] ?? dashboard.blockedByPolicy[0];
      return {
        queryId: input.queryId,
        question: definition.question,
        category: "governance",
        previewMode: P69_PREVIEW_MODE,
        sourceSystem,
        lastRefreshedAt: input.fetchedAt,
        total: top ? 1 : 0,
        metrics: { previewMode: 1 },
        comparison: null,
        summary: top
          ? `${top.governanceReason} Blocking: ${top.blockingRules.join("; ") || "policy review"}.`
          : "All governed decisions pass automation checks in preview.",
      };
    }
    case "governance_pilot_eligible": {
      return {
        queryId: input.queryId,
        question: definition.question,
        category: "governance",
        previewMode: P69_PREVIEW_MODE,
        sourceSystem,
        lastRefreshedAt: input.fetchedAt,
        total: metrics.pilotEligibleActions,
        metrics: { pilotEligible: metrics.pilotEligibleActions },
        comparison: null,
        summary:
          metrics.pilotEligibleActions > 0
            ? `${metrics.pilotEligibleActions} decision${metrics.pilotEligibleActions === 1 ? "" : "s"} match pilot market rules.`
            : "No decisions currently match pilot eligibility filters.",
      };
    }
    case "governance_safe_to_approve": {
      const safe = dashboard.autoApprovedDecisions.filter((d) => d.risk === "low" && d.confidence >= 90);
      return {
        queryId: input.queryId,
        question: definition.question,
        category: "governance",
        previewMode: P69_PREVIEW_MODE,
        sourceSystem,
        lastRefreshedAt: input.fetchedAt,
        total: safe.length,
        metrics: { confidence: metrics.averageConfidence ?? 0 },
        comparison: null,
        summary:
          safe.length > 0
            ? `${safe.length} low-risk, high-confidence decision${safe.length === 1 ? "" : "s"} safe to approve in preview.`
            : "No decisions meet safe-to-approve criteria yet.",
      };
    }
    case "governance_executive_approval": {
      return {
        queryId: input.queryId,
        question: definition.question,
        category: "governance",
        previewMode: P69_PREVIEW_MODE,
        sourceSystem,
        lastRefreshedAt: input.fetchedAt,
        total: metrics.executiveApprovalRequired,
        metrics: { executive: metrics.executiveApprovalRequired },
        comparison: null,
        summary:
          metrics.executiveApprovalRequired > 0
            ? `${metrics.executiveApprovalRequired} decision${metrics.executiveApprovalRequired === 1 ? "" : "s"} require executive approval.`
            : "No decisions currently require executive approval.",
      };
    }
    case "governance_blocking_rules": {
      const rules = new Set<string>();
      for (const d of [...dashboard.blockedByPolicy, ...dashboard.policyExceptions].slice(0, 20)) {
        for (const rule of d.blockingRules) rules.add(rule);
      }
      const list = [...rules].slice(0, 5).join("; ");
      return {
        queryId: input.queryId,
        question: definition.question,
        category: "governance",
        previewMode: P69_PREVIEW_MODE,
        sourceSystem,
        lastRefreshedAt: input.fetchedAt,
        total: rules.size,
        metrics: { blocked: metrics.blockedByPolicy },
        comparison: null,
        summary:
          rules.size > 0
            ? `Top blocking rules: ${list}.`
            : "No active blocking rules — preview mode is the primary gate.",
      };
    }
    default:
      return null;
  }
}
