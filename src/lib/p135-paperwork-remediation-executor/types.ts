export const P135_SOURCE_PHASE = "P135";
export const P135_EXECUTOR_MODE = "previewOnly" as const;

export type SafeRemediationActionId =
  | "assign_paperwork_ready_locally"
  | "refresh_resume_detection"
  | "refresh_questionnaire_enrichment"
  | "refresh_candidate_enrichment"
  | "refresh_project_mapping"
  | "recompute_mapping_confidence"
  | "regenerate_approval_score"
  | "rerun_p124_approval_engine"
  | "rerun_p123_orchestrator"
  | "rerun_p122_readiness_evaluation"
  | "update_remediation_history"
  | "clear_resolved_local_blockers";

export type HumanRemediationActionId =
  | "assign_recruiter_breezy"
  | "move_candidate_breezy_job"
  | "publish_breezy_job"
  | "close_breezy_job"
  | "modify_candidate_profile_breezy"
  | "change_mapping_confidence_without_approval"
  | "send_paperwork";

export type RemediationActionId = SafeRemediationActionId | HumanRemediationActionId;

export type RemediationCandidateState = {
  approvalScore: number;
  approvalDecision: string;
  eligibilityStatus: string;
  p122Status: string;
  hasResume: boolean;
  paperworkReady: boolean;
  mappingConfidence: number;
  blockerIds: string[];
};

export type RemediationExecutionRecord = {
  recordId: string;
  candidateId: string;
  candidateName: string;
  action: RemediationActionId;
  owner: string;
  automatic: boolean;
  beforeState: RemediationCandidateState;
  afterState: RemediationCandidateState;
  approvalScoreDelta: number;
  decisionDelta: string | null;
  executionTimeMs: number;
  success: boolean;
  failureReason: string | null;
  auditTrail: string[];
};

export type HumanRemediationTask = {
  taskId: string;
  candidateId: string;
  candidateName: string;
  action: HumanRemediationActionId;
  owner: string;
  blockerId: string;
  label: string;
  detail: string;
  steps: string[];
  priority: number;
};

export type CandidateRemediationResult = {
  candidateId: string;
  candidateName: string;
  tier: number;
  beforeScore: number;
  afterScore: number;
  beforeDecision: string;
  afterDecision: string;
  automaticActionsCompleted: number;
  manualTasksRemaining: number;
  blockersCleared: string[];
  blockersRemaining: string[];
  resolved: boolean;
  executionRecords: RemediationExecutionRecord[];
  humanTasks: HumanRemediationTask[];
};

export type PaperworkRemediationExecutorReport = {
  sourcePhase: typeof P135_SOURCE_PHASE;
  generatedAt: string;
  mode: typeof P135_EXECUTOR_MODE;
  previewOnly: boolean;
  summary: {
    candidatesProcessed: number;
    automaticFixesCompleted: number;
    manualFixesRemaining: number;
    estimatedApprovalsUnlocked: number;
    recentlyResolvedCount: number;
    failedRemediationCount: number;
    candidatesNowAutoApproved: number;
  };
  executivePanel: {
    automaticFixesCompleted: number;
    manualFixesRemaining: number;
    estimatedApprovalsUnlocked: number;
    recentlyResolvedCandidates: Array<{
      candidateId: string;
      candidateName: string;
      beforeDecision: string;
      afterDecision: string;
      scoreDelta: number;
    }>;
    auditHistory: RemediationExecutionRecord[];
    failedRemediations: RemediationExecutionRecord[];
    retryableFailures: RemediationExecutionRecord[];
  };
  humanTaskQueue: HumanRemediationTask[];
  candidateResults: CandidateRemediationResult[];
  goNoGo: "GO" | "GO WITH CONDITIONS" | "NO-GO";
  goNoGoReason: string;
  executeBatchCalled: false;
  breezyWrites: false;
  liveModeEnabled: boolean;
  paperworkSent: false;
};
