export const P88_RECONCILIATION_PHASE = "P88";
export const P88_PREVIEW_MODE = true as const;

export type BlockerClassId =
  | "recruiter_assignment_missing"
  | "candidate_not_in_correct_stage"
  | "job_closed_unpublished"
  | "paperwork_already_sent"
  | "duplicate_candidate"
  | "missing_resume"
  | "missing_questionnaire"
  | "missing_dm_project_data"
  | "parser_field_mismatch"
  | "rule_mismatch_p87_p84"
  | "real_disqualification"
  | "terminal_or_inactive_state"
  | "missing_contact_data"
  | "workflow_state_stale"
  | "none_eligible";

export type BlockerClassSummary = {
  id: BlockerClassId;
  label: string;
  count: number;
  recommendedFix: string;
};

export type PaperworkEligibilityCandidateTrace = {
  candidateId: string;
  candidateName: string;
  email: string;
  positionId: string;
  positionName: string;
  p56: {
    grade: string;
    overallScore: number;
    paperworkReady: boolean;
    paperworkReadinessScore: number;
    confidence: string;
    techReady: boolean | null;
  };
  p86: {
    resumeAvailable: boolean;
    questionnaireAvailable: boolean;
    questionnaireAnswerCount: number;
    hasResumeFlag: boolean;
    hasQuestionnaireFlag: boolean;
  };
  p87: {
    action: string;
    recommendationLabel: string;
    hasReadyForPaperworkSignal: boolean;
  };
  p83: {
    action: string;
    shouldAdvance: boolean;
    shouldPersist: boolean;
    reason: string;
    requiresApproval: boolean;
  };
  workflow: {
    workflowStatus: string;
    breezyStage: string;
    actionType: string;
    assignedRecruiter: string;
    assignedDM: string;
    dmNeedsAssignment: boolean;
    paperworkStatus: string;
    signatureRequestId: string | null;
    isScreenStage: boolean;
  };
  job: {
    publishedJobMatch: boolean;
  };
  p84: {
    eligible: boolean;
    blockingGates: Array<{ id: string; label: string; detail: string | null }>;
    primaryGateId: string | null;
    primaryBlockerDetail: string | null;
  };
  primaryBlockerId: BlockerClassId;
  primaryBlockerLabel: string;
  allBlockerIds: BlockerClassId[];
  ruleMismatchNote: string | null;
  wouldBeEligibleAfterP83Advancement: boolean;
  wouldBeEligibleAfterRecruiterAssignment: boolean;
  wouldBeEligibleAfterOperationalFixes: boolean;
  shouldRemainBlocked: boolean;
  recommendedFix: string;
};

export type PaperworkEligibilityReconciliationReport = {
  sourcePhase: typeof P88_RECONCILIATION_PHASE;
  previewMode: typeof P88_PREVIEW_MODE;
  generatedAt: string;
  mtdRangeLabel: string;
  summary: {
    totalReadyGradeCandidates: number;
    totalP84Eligible: number;
    totalP84Ineligible: number;
    eligibleAfterP83Advancement: number;
    eligibleAfterRecruiterAssignment: number;
    eligibleAfterOperationalFixes: number;
    shouldRemainBlocked: number;
    rootCause: string;
  };
  blockerBreakdown: BlockerClassSummary[];
  ruleAlignment: {
    p87ReadySignalDefinition: string;
    p84EligibilityDefinition: string;
    primaryMismatch: string;
    explanation: string;
    readinessLabels: {
      questionnaireReady: string;
      workflowReady: string;
      p84SendEligible: string;
      paperworkAlreadySent: string;
    };
  };
  traces: PaperworkEligibilityCandidateTrace[];
  remainingBlockersBeforeLiveSend: string[];
};
