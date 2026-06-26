import type { AutonomousDecision, DecisionRisk } from "@/lib/autonomous-decision-engine/types";

export const P77_SOURCE_PHASE = "P77";
export const P77_PREVIEW_MODE = true as const;
export const P77_DEFAULT_GOVERNANCE_ENABLED = false;
export const P77_DEFAULT_EXECUTION_MODE = "preview" as const;

export type GovernanceExecutionMode = "off" | "preview" | "pilot" | "production";

export type ApprovalLevel =
  | "auto_approved"
  | "recruiter_approval_required"
  | "dm_approval_required"
  | "executive_approval_required"
  | "blocked";

export type P77FeatureFlags = {
  governanceEnabled: boolean;
  executionMode: GovernanceExecutionMode;
  previewMode: boolean;
  updatedAt: string;
};

export type GovernanceControls = {
  governanceEnabled: boolean;
  executionMode: GovernanceExecutionMode;
  previewMode: boolean;
  canExecute: boolean;
  previewOnly: boolean;
};

export type GovernancePolicyId =
  | "minimum_confidence_auto"
  | "maximum_risk_auto"
  | "preview_mode_gate"
  | "paperwork_template_confirmed"
  | "communication_valid_recipient"
  | "sms_channel_disabled"
  | "email_channel_disabled"
  | "duplicate_packet_prevention"
  | "executive_high_risk"
  | "missing_required_fields"
  | "pilot_market_eligibility"
  | "decision_blocked_upstream";

export type GovernancePolicy = {
  id: GovernancePolicyId;
  label: string;
  description: string;
  threshold?: string;
};

export type GovernedDecision = AutonomousDecision & {
  approvalLevel: ApprovalLevel;
  governanceReason: string;
  requiredApprover: string;
  appliedPolicies: GovernancePolicyId[];
  allowedRules: string[];
  blockingRules: string[];
  pilotEligible: boolean;
  auditLogPreview: string[];
};

export type ApprovalQueueItem = {
  decisionId: string;
  candidateId: string | null;
  candidateName: string | null;
  recommendedAction: string;
  requiredApprover: string;
  approvalLevel: ApprovalLevel;
  confidence: number;
  risk: DecisionRisk;
  reason: string;
  blockingRules: string[];
  expectedOutcome: string;
  timeSavedMinutesIfApproved: number;
};

export type GovernanceHealth = {
  status: "healthy" | "warning" | "critical";
  autoApprovalRate: number | null;
  blockedRate: number | null;
  summary: string;
};

export type GovernanceExecutiveMetrics = {
  totalDecisionsReviewed: number;
  autoApproved: number;
  recruiterApprovalRequired: number;
  dmApprovalRequired: number;
  executiveApprovalRequired: number;
  blockedByPolicy: number;
  averageConfidence: number | null;
  averageRiskScore: number | null;
  estimatedRecruiterTimeSaved: number;
  pilotEligibleActions: number;
};

export type GovernanceDashboardSnapshot = {
  sourcePhase: typeof P77_SOURCE_PHASE;
  previewMode: typeof P77_PREVIEW_MODE;
  fetchedAt: string;
  controls: GovernanceControls;
  policies: GovernancePolicy[];
  autoApprovedDecisions: GovernedDecision[];
  approvalRequired: GovernedDecision[];
  blockedByPolicy: GovernedDecision[];
  highRiskDecisions: GovernedDecision[];
  pilotEligibleDecisions: GovernedDecision[];
  policyExceptions: GovernedDecision[];
  approvalQueue: ApprovalQueueItem[];
  governanceHealth: GovernanceHealth;
  executiveMetrics: GovernanceExecutiveMetrics;
  warnings: string[];
};

export type AutonomousApprovalGovernancePreviewResult = {
  ok: true;
  previewMode: typeof P77_PREVIEW_MODE;
  fetchedAt: string;
  dashboard: GovernanceDashboardSnapshot;
  warnings: string[];
};
