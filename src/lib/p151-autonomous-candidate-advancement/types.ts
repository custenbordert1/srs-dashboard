import type { AdvancementNextAction } from "@/lib/recruiting/candidate-advancement-engine";

export const P151_SOURCE_PHASE = "P151";
export const P151_DEFAULT_MAX_ASSIGNMENTS = 25;
export const P151_DEFAULT_MAX_ADVANCES = 10;

export type PipelineDashboardNextAction =
  | "Assign Recruiter"
  | "Recruiter Review"
  | "Contact Candidate"
  | "Send Paperwork"
  | "Ready for MEL"
  | "Hired"
  | "Other";

export type PipelineCandidateAnalysis = {
  candidateId: string;
  candidateName: string;
  breezyStage: string;
  workflowStatus: string;
  nextAction: AdvancementNextAction;
  dashboardNextAction: PipelineDashboardNextAction;
  recruiterAssigned: boolean;
  recruiter: string;
  publishedJob: boolean;
  openProject: boolean;
  projectName: string;
  confidence: number;
  advancementScore: number;
  blockers: string[];
  whyStopped: string;
  preventingRule: string;
  recommendedFix: string;
  automationEligible: boolean;
  p83Action: string;
  p83Reason: string;
};

export type PipelineAdvancementAuditEvent = {
  id: string;
  at: string;
  type: "recruiter_assigned" | "candidate_advanced" | "assignment_blocked" | "advancement_blocked";
  candidateId: string;
  candidateName: string;
  executed: boolean;
  simulated: boolean;
  reason: string;
  metadata: Record<string, unknown>;
};

export type PipelineDashboardMetrics = {
  candidatesWaitingAssignment: number;
  candidatesAdvancedToday: number;
  assignmentsCompletedToday: number;
  blockedCandidates: number;
  topBlockers: Array<{ blocker: string; count: number }>;
  averageTimeInStageHours: Record<string, number>;
  pipelineFlow: Record<PipelineDashboardNextAction, number>;
  nextActionCounts: Record<string, number>;
};

export type PipelineAdvancementExecutionItem = {
  candidateId: string;
  candidateName: string;
  phase: "recruiter_assignment" | "workflow_advancement";
  result: "assigned" | "advanced" | "skipped" | "blocked" | "failed";
  reason: string;
  recruiter?: string;
  newWorkflowStatus?: string;
  executionMode: "dry_run" | "live";
};

export type PipelineAdvancementSummary = {
  sourcePhase: typeof P151_SOURCE_PHASE;
  generatedAt: string;
  dryRun: boolean;
  autonomousAdvancementEnabled: boolean;
  candidatesEvaluated: number;
  candidatesEligibleForAssignment: number;
  candidatesEligibleForAdvancement: number;
  recruitersAssigned: number;
  candidatesAdvanced: number;
  candidatesBlocked: number;
  candidatesSkipped: number;
  failures: number;
  duplicateAssignmentsPrevented: number;
  topBlockerCounts: Array<{ blocker: string; count: number }>;
  nextActionCounts: Record<string, number>;
  executionTimeMs: number;
  safetyFlags: {
    breezyWrites: false;
    executeBatchCalled: false;
    p151Enabled: boolean;
    requireApprovalBypassed: boolean;
  };
  readinessScore: number;
  rollbackRecommendation: string;
  analysis: PipelineCandidateAnalysis[];
  dashboard: PipelineDashboardMetrics;
  executionItems: PipelineAdvancementExecutionItem[];
  capReached: boolean;
  stoppedOnError: boolean;
};
