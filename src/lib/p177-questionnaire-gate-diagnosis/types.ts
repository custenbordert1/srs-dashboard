export const P177_SOURCE_PHASE = "P177";

export type P177BlockerClassification =
  | "true_business_requirement"
  | "artificial_workflow_gate"
  | "safe_to_automate"
  | "remain_manual_review";

export type P177CandidateDiagnosis = {
  rank: number;
  candidateId: string;
  name: string;
  email: string;
  assignedRecruiter: string;
  ingestionSource: string | null;
  currentP157Action: string;
  workflowStatus: string;
  paperworkStage: string | null;
  p152Eligible: boolean;
  p152Blockers: string[];
  questionnaireAvailable: boolean;
  questionnaireTechReady: boolean | null;
  questionnaireAnswerCount: number;
  questionnaireMissingFields: string[];
  resumeInExport: boolean;
  questionnaireInExport: boolean;
  questionnaireInApiStore: boolean;
  primaryBlocker: string;
  blockerClassification: P177BlockerClassification;
  simulatedP157IfQuestionnaireBypass: string;
  simulatedP157IfQuestionnaireAndWorkflowBypass: string;
  wouldSendPaperworkIfQuestionnaireBypass: boolean;
  wouldSendPaperworkIfFullBypass: boolean;
};

export type P177PatriciaDiagnosis = {
  assignedRecruiter: string;
  currentP157Action: string;
  questionnaireAvailable: boolean;
  questionnaireAnswerCount: number;
  p152Eligible: boolean;
  primaryBlocker: string;
  blockerClassification: P177BlockerClassification;
  wouldSendIfQuestionnaireBypass: boolean;
  wouldSendIfFullBypass: boolean;
  explanation: string;
};

export type P177QuestionnaireGateReport = {
  sourcePhase: typeof P177_SOURCE_PHASE;
  generatedAt: string;
  readOnly: true;
  findings: {
    p157SendPaperworkRequirements: string[];
    questionnaireFieldsChecked: string[];
    exportHasQuestionnaireData: boolean;
    apiStoreQuestionnaireCoverageNewest25: number;
    questionnaireRequiredFor1099Onboarding: string;
    p152CoversRealPaperworkRisks: boolean;
    p152RiskChecks: string[];
  };
  summary: {
    newest25Count: number;
    reviewQuestionnaireCount: number;
    artificialGateCount: number;
    trueManualReviewCount: number;
    wouldSendIfQuestionnaireBypass: number;
    wouldSendIfFullBypass: number;
    remainManualReview: number;
    projectedDropboxAfterSafestChange: number;
  };
  newest25: P177CandidateDiagnosis[];
  wouldMoveToSendPaperwork: Array<{ candidateId: string; name: string; scenario: string }>;
  mustStayManualReview: Array<{ candidateId: string; name: string; reason: string }>;
  patriciaIrby: P177PatriciaDiagnosis;
  recommendedSafestChange: {
    change: string;
    rationale: string;
    classification: P177BlockerClassification;
    expectedPaperworkSendCount: number;
    safetyConfirmation: string[];
  };
  blockerBreakdown: Record<P177BlockerClassification, number>;
  conclusion: string;
};
