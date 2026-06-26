import type { AutonomousDecision } from "@/lib/autonomous-decision-engine/types";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { P71FeatureFlags } from "@/lib/autonomous-paperwork-execution-engine/types";
import type { P73FeatureFlags } from "@/lib/autonomous-candidate-communication-engine/types";
import { passesPilotFilters } from "@/lib/autonomous-paperwork-execution-engine/pilot-filters";
import { GOVERNANCE_POLICY_THRESHOLDS } from "@/lib/autonomous-approval-governance/policy-registry";
import type {
  ApprovalLevel,
  GovernedDecision,
  GovernancePolicyId,
  P77FeatureFlags,
} from "@/lib/autonomous-approval-governance/types";

const RISK_RANK = { low: 1, medium: 2, high: 3, critical: 4 } as const;

function approverForLevel(level: ApprovalLevel): string {
  switch (level) {
    case "auto_approved":
      return "System (preview simulation only)";
    case "recruiter_approval_required":
      return "Assigned recruiter";
    case "dm_approval_required":
      return "District manager";
    case "executive_approval_required":
      return "Executive leadership";
    case "blocked":
      return "None — blocked by policy";
    default:
      return "Unknown";
  }
}

function rowForDecision(
  decision: AutonomousDecision,
  workflowRows: ScoredCandidateWorkflowRow[],
): ScoredCandidateWorkflowRow | null {
  const candidateId = decision.affectedCandidateIds[0];
  if (!candidateId) return null;
  return workflowRows.find((row) => row.candidateId === candidateId) ?? null;
}

function isCommunicationDecision(decision: AutonomousDecision): boolean {
  return decision.category === "communication" || /email|sms|communication|reminder/i.test(decision.decision);
}

function isPaperworkDecision(decision: AutonomousDecision): boolean {
  return decision.category === "paperwork" || /paperwork|signature|packet/i.test(decision.decision);
}

function isSmsDecision(decision: AutonomousDecision): boolean {
  return /sms|text message/i.test(decision.decision);
}

function isEmailDecision(decision: AutonomousDecision): boolean {
  return /email/i.test(decision.decision);
}

export function evaluateGovernanceForDecision(input: {
  decision: AutonomousDecision;
  workflowRows: ScoredCandidateWorkflowRow[];
  p71Flags: P71FeatureFlags;
  p73Flags: P73FeatureFlags;
  p77Flags: P77FeatureFlags;
}): GovernedDecision {
  const { decision, workflowRows, p71Flags, p73Flags, p77Flags } = input;
  const row = rowForDecision(decision, workflowRows);

  const blockingRules: string[] = [];
  const allowedRules: string[] = [];
  const appliedPolicies: GovernancePolicyId[] = [];

  let approvalLevel: ApprovalLevel = "recruiter_approval_required";
  let governanceReason = "Default governance review required.";

  if (decision.blocked || decision.blockedBy.length > 0) {
    appliedPolicies.push("decision_blocked_upstream");
    blockingRules.push(decision.blockedBy.join("; ") || "Upstream decision engine blocker");
    approvalLevel = "blocked";
    governanceReason = "Blocked by upstream decision blockers.";
  }

  if (row && !row.email?.trim()) {
    appliedPolicies.push("missing_required_fields");
    blockingRules.push("Candidate email missing");
    if (isCommunicationDecision(decision) || isEmailDecision(decision)) {
      appliedPolicies.push("communication_valid_recipient");
      approvalLevel = "blocked";
      governanceReason = "Communication blocked — valid recipient required.";
    }
  }

  if (row && !row.assignedRecruiter?.trim()) {
    appliedPolicies.push("missing_required_fields");
    blockingRules.push("Assigned recruiter missing");
    if (approvalLevel !== "blocked") {
      approvalLevel = "recruiter_approval_required";
      governanceReason = "Recruiter ownership required before automation.";
    }
  }

  if (isPaperworkDecision(decision)) {
    appliedPolicies.push("paperwork_template_confirmed");
    if (/duplicate/i.test(decision.reason) || (row?.paperworkStatus === "sent" && /send paperwork/i.test(decision.decision))) {
      appliedPolicies.push("duplicate_packet_prevention");
      if (/duplicate/i.test(decision.reason)) {
        blockingRules.push("Duplicate paperwork packet detected");
        approvalLevel = "blocked";
        governanceReason = "Duplicate packet prevention policy blocks this action.";
      }
    }
  }

  if (isSmsDecision(decision) && !p73Flags.smsEnabled) {
    appliedPolicies.push("sms_channel_disabled");
    blockingRules.push("SMS channel disabled by policy");
    approvalLevel = "blocked";
    governanceReason = "SMS disabled unless explicitly enabled.";
  }

  if (isEmailDecision(decision) && !p73Flags.emailEnabled) {
    appliedPolicies.push("email_channel_disabled");
    blockingRules.push("Email channel disabled by policy");
    approvalLevel = "blocked";
    governanceReason = "Email disabled unless explicitly enabled.";
  }

  if (decision.risk === "critical") {
    appliedPolicies.push("executive_high_risk");
    if (approvalLevel !== "blocked") {
      approvalLevel = "executive_approval_required";
      governanceReason = "Critical risk requires executive approval.";
    }
  } else if (decision.risk === "high" && approvalLevel !== "blocked") {
    appliedPolicies.push("executive_high_risk");
    approvalLevel = "dm_approval_required";
    governanceReason = "High risk requires district manager approval.";
  }

  if (decision.confidence < GOVERNANCE_POLICY_THRESHOLDS.minimumConfidenceForAutoApproval) {
    appliedPolicies.push("minimum_confidence_auto");
    blockingRules.push(
      `Confidence ${decision.confidence}% below ${GOVERNANCE_POLICY_THRESHOLDS.minimumConfidenceForAutoApproval}% threshold`,
    );
    if (approvalLevel !== "blocked" && approvalLevel !== "executive_approval_required" && approvalLevel !== "dm_approval_required") {
      approvalLevel = "recruiter_approval_required";
      governanceReason = `Confidence ${decision.confidence}% below auto-approval threshold.`;
    }
  }

  if (RISK_RANK[decision.risk] > RISK_RANK.low) {
    appliedPolicies.push("maximum_risk_auto");
  }

  const pilotEligible = row
    ? passesPilotFilters({ row, flags: p71Flags }) || passesPilotFilters({ row, flags: { ...p71Flags, executionMode: "pilot" } })
    : false;

  if (pilotEligible) {
    appliedPolicies.push("pilot_market_eligibility");
    allowedRules.push("Candidate matches pilot market filters");
  }

  const previewGate =
    p77Flags.previewMode ||
    p77Flags.executionMode === "preview" ||
    p71Flags.executionMode === "preview";

  if (previewGate && approvalLevel !== "blocked") {
    appliedPolicies.push("preview_mode_gate");
    blockingRules.push("Automation is still in preview mode");
    approvalLevel = "recruiter_approval_required";
    governanceReason = "Automation is still in preview mode.";
  } else if (
    approvalLevel !== "blocked" &&
    approvalLevel !== "executive_approval_required" &&
    approvalLevel !== "dm_approval_required" &&
    decision.confidence >= GOVERNANCE_POLICY_THRESHOLDS.minimumConfidenceForAutoApproval &&
    decision.risk === "low" &&
    !decision.blocked &&
    decision.blockedBy.length === 0 &&
    (p77Flags.executionMode === "pilot" ? pilotEligible : p77Flags.executionMode === "production")
  ) {
    appliedPolicies.push("minimum_confidence_auto", "maximum_risk_auto");
    allowedRules.push("Meets confidence and risk thresholds");
    if (pilotEligible) allowedRules.push("Pilot market eligible");
    approvalLevel = "auto_approved";
    governanceReason = pilotEligible
      ? "Candidate meets all requirements and market is included in pilot rules."
      : "Decision meets all governance policies for auto-approval.";
  }

  if (decision.category === "executive" && approvalLevel !== "blocked") {
    approvalLevel = "executive_approval_required";
    governanceReason = "Executive-category decisions require leadership approval.";
  }

  const auditLogPreview = [
    `Governance evaluated decision ${decision.decisionId}`,
    `Approval level: ${approvalLevel.replace(/_/g, " ")}`,
    `Confidence: ${decision.confidence}% · Risk: ${decision.risk}`,
    ...blockingRules.map((rule) => `Block: ${rule}`),
    ...allowedRules.map((rule) => `Allow: ${rule}`),
    "Preview only — no approval mutation or execution performed.",
  ];

  return {
    ...decision,
    approvalLevel,
    governanceReason,
    requiredApprover: approverForLevel(approvalLevel),
    appliedPolicies,
    allowedRules,
    blockingRules,
    pilotEligible,
    auditLogPreview,
  };
}

export function evaluateGovernanceForDecisions(input: {
  decisions: AutonomousDecision[];
  workflowRows: ScoredCandidateWorkflowRow[];
  p71Flags: P71FeatureFlags;
  p73Flags: P73FeatureFlags;
  p77Flags: P77FeatureFlags;
}): GovernedDecision[] {
  return input.decisions.map((decision) =>
    evaluateGovernanceForDecision({
      decision,
      workflowRows: input.workflowRows,
      p71Flags: input.p71Flags,
      p73Flags: input.p73Flags,
      p77Flags: input.p77Flags,
    }),
  );
}
