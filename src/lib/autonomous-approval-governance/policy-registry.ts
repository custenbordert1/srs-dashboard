import type { GovernancePolicy } from "@/lib/autonomous-approval-governance/types";

export const GOVERNANCE_POLICY_THRESHOLDS = {
  minimumConfidenceForAutoApproval: 95,
  maximumRiskForAutoApproval: "low" as const,
};

export const GOVERNANCE_POLICIES: GovernancePolicy[] = [
  {
    id: "minimum_confidence_auto",
    label: "Minimum confidence for auto approval",
    description: "Decisions below threshold require human review.",
    threshold: `${GOVERNANCE_POLICY_THRESHOLDS.minimumConfidenceForAutoApproval}%`,
  },
  {
    id: "maximum_risk_auto",
    label: "Maximum risk for auto approval",
    description: "Only low-risk decisions may auto-execute.",
    threshold: GOVERNANCE_POLICY_THRESHOLDS.maximumRiskForAutoApproval,
  },
  {
    id: "preview_mode_gate",
    label: "Preview mode gate",
    description: "Automation remains in preview — recruiter approval required.",
  },
  {
    id: "paperwork_template_confirmed",
    label: "Paperwork requires confirmed template",
    description: "Paperwork actions need template certainty before auto-send.",
  },
  {
    id: "communication_valid_recipient",
    label: "Communication requires valid recipient",
    description: "Email/SMS actions blocked when recipient data is missing.",
  },
  {
    id: "sms_channel_disabled",
    label: "SMS disabled unless explicitly enabled",
    description: "SMS channel requires explicit feature enablement.",
  },
  {
    id: "email_channel_disabled",
    label: "Email disabled unless explicitly enabled",
    description: "Email channel requires explicit feature enablement.",
  },
  {
    id: "duplicate_packet_prevention",
    label: "Duplicate packet prevention required",
    description: "Duplicate paperwork packets are blocked by policy.",
  },
  {
    id: "executive_high_risk",
    label: "Executive approval for high-risk action",
    description: "Critical or high-risk decisions require executive sign-off.",
  },
  {
    id: "missing_required_fields",
    label: "Missing required fields",
    description: "Incomplete candidate records block automation.",
  },
  {
    id: "pilot_market_eligibility",
    label: "Pilot market eligibility",
    description: "Pilot auto-approval only for configured markets/recruiters.",
  },
  {
    id: "decision_blocked_upstream",
    label: "Upstream decision blocker",
    description: "Decision engine flagged unresolved blockers.",
  },
];

export function getGovernancePolicy(id: GovernancePolicy["id"]): GovernancePolicy | undefined {
  return GOVERNANCE_POLICIES.find((policy) => policy.id === id);
}
