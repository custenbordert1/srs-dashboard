import type { AiLetterGrade } from "@/lib/candidate-ai-scoring";
import type { CandidateWorkflowStatus } from "@/lib/candidate-workflow-types";

export type FunnelGate =
  | "mtd_ingested"
  | "workflow_sync"
  | "p62_assignment"
  | "p63_action"
  | "p64_progression"
  | "p65_2_execution"
  | "p65_3_paperwork";

export type GateFailureReason =
  | "missing_workflow_record"
  | "terminal_status"
  | "manual_recruiter_hold"
  | "recruiter_unassigned"
  | "territory_undetermined"
  | "no_recruiter_roster"
  | "assignment_confidence_low"
  | "missing_p63_action"
  | "p63_action_none"
  | "missing_p64_progression"
  | "execution_not_mappable"
  | "missing_contact_email"
  | "missing_job_match"
  | "wrong_paperwork_action_type"
  | "active_paperwork_packet"
  | "paperwork_already_signed"
  | "ready_for_mel_terminal"
  | "eligible";

export type CandidateGateTrace = {
  candidateId: string;
  firstStageReached: FunnelGate;
  firstStageFailed: FunnelGate | null;
  failureReason: GateFailureReason;
};

export type FunnelReadinessAudit = {
  totalCandidates: number;
  recruiterAssigned: number;
  recruiterUnassigned: number;
  p63ActionGenerated: number;
  missingAction: number;
  gradeDistribution: Record<AiLetterGrade, number>;
  confidenceDistribution: {
    high: number;
    medium: number;
    low: number;
    none: number;
  };
  workflowStatusDistribution: Record<string, number>;
};

export type GateFailureCounts = Record<GateFailureReason, number>;

export type ReplacementReadinessScore = {
  assignmentReadinessPct: number;
  actionReadinessPct: number;
  decisionReadinessPct: number;
  executionReadinessPct: number;
  paperworkReadinessPct: number;
};

export type AutomationBlockers = {
  blockedBeforeAssignment: number;
  blockedBeforeP63: number;
  blockedBeforeP64: number;
  blockedBeforeP65_2: number;
  blockedBeforeP65_3: number;
};

export type RecruiterReplacementReadiness = {
  audit: FunnelReadinessAudit;
  gateFailureCounts: GateFailureCounts;
  firstStageFailedCounts: Record<FunnelGate, number>;
  readinessScore: ReplacementReadinessScore;
  blockers: AutomationBlockers;
  rootCause: {
    summary: string;
    primaryGate: FunnelGate;
    primaryReason: GateFailureReason;
    recommendedFixLocation: string;
  };
  mtdTotal: number;
  paperworkEligible: number;
};
