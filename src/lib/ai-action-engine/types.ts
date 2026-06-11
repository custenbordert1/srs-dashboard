import type { AiInsightSeverity } from "@/lib/ai-recruiting-command-center/types";

export type AiActionKind =
  | "create-job-ad"
  | "assign-recruiter"
  | "create-dm-escalation"
  | "send-follow-up"
  | "push-candidate-mel"
  | "generate-route-plan";

export type AiActionPayload = {
  candidateId?: string;
  jobId?: string;
  opportunityId?: string;
  opportunityIds?: string[];
  assignedRecruiter?: string;
  escalationType?: string;
  jobTitle?: string;
  city?: string;
  state?: string;
  territory?: string;
  dmName?: string;
  insightId?: string;
  notificationId?: string;
};

export type AiActionProposal = {
  id: string;
  insightId: string;
  actionKind: AiActionKind;
  label: string;
  description: string;
  payload: AiActionPayload;
  priorityScore: number;
  expectedImpact: string;
  severity: AiInsightSeverity;
  manualOnly: true;
};

export type AiActionExecutionResult = {
  ok: boolean;
  actionKind: AiActionKind;
  insightId: string;
  message: string;
  outcomeId?: string;
  error?: string;
};

export type AiActionAuditEntry = {
  id: string;
  insightId: string;
  recommendation: string;
  actionKind: AiActionKind;
  userId: string;
  userName: string;
  outcome: "success" | "failure";
  outcomeDetail: string;
  timestamp: string;
  entityId?: string;
};

export type AiMemoryRecord = {
  id: string;
  insightId: string;
  recommendation: string;
  actionTaken: AiActionKind | null;
  result: string | null;
  recordedAt: string;
};

export type AiWorkflowCondition = {
  coverageRiskGt?: number;
  zeroApplicantJobsGt?: number;
  followUpsDueGt?: number;
};

export type AiWorkflowThenAction = {
  actionKind: AiActionKind;
  label: string;
};

export type AiWorkflowRule = {
  id: string;
  name: string;
  enabled: boolean;
  if: AiWorkflowCondition;
  then: AiWorkflowThenAction[];
};

export type TriggeredWorkflow = {
  ruleId: string;
  ruleName: string;
  triggeredAt: string;
  proposedActions: AiActionProposal[];
};

export type CandidateRecoveryItem = {
  candidateId: string;
  name: string;
  city: string;
  state: string;
  recoveryType: "stalled" | "inactive" | "uncontacted";
  reason: string;
  recommendedAction: AiActionKind;
  priorityScore: number;
};

export type TerritoryRecoveryPlan = {
  territory: string;
  attentionScore: number;
  immediate: string[];
  sevenDay: string[];
  thirtyDay: string[];
};

export type ExecutiveActionItem = {
  id: string;
  title: string;
  explanation: string;
  priorityScore: number;
  expectedImpact: string;
  proposals: AiActionProposal[];
};

export type AiActionCenterSnapshot = {
  fetchedAt: string;
  executiveActions: ExecutiveActionItem[];
  insightProposals: Record<string, AiActionProposal[]>;
  candidateRecovery: CandidateRecoveryItem[];
  territoryRecoveryPlans: TerritoryRecoveryPlan[];
  triggeredWorkflows: TriggeredWorkflow[];
  recentAudit: AiActionAuditEntry[];
  memorySummary: {
    recommendationsTracked: number;
    actionsTaken: number;
    successRate: number;
  };
};
