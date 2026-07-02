export const P139_SOURCE_PHASE = "P139";
export const P139_RUNBOOK_MODE = "runbookOnly" as const;
export const P139_TARGET_CANDIDATE_ID = "e72d6aebdb0d";
export const P139_TARGET_CANDIDATE_NAME = "Erica C Portolese";
export const P139_OPERATOR_NAME = "Taylor";

export type HumanReviewChecklistItem = {
  id: string;
  label: string;
  breezyField: string;
  expectedValue: string;
  instruction: string;
};

export type TerminalCommands = {
  enablePilotEnv: string[];
  allowlistEricaOnly: string;
  p122LivePilotCommand: string;
  p138VerificationCommand: string;
  disableLiveEnv: string[];
  pauseSchedulerCommand: string;
};

export type RollbackInstructions = {
  confirmNoSecondSend: string[];
  clearAllowlist: string[];
  pauseScheduler: string[];
  verifyDuplicateProtection: string[];
  confirmAuditRecord: string[];
};

export type FirstLivePilotOperatorRunbookReport = {
  sourcePhase: typeof P139_SOURCE_PHASE;
  generatedAt: string;
  mode: typeof P139_RUNBOOK_MODE;
  operator: typeof P139_OPERATOR_NAME;
  candidate: {
    candidateId: string;
    candidateName: string;
    email: string;
    phone: string | null;
    breezyJobOrProject: string;
    dropboxSignTemplate: string;
    dropboxSignTemplateKey: string;
    approvalScore: number;
    p124ApprovalDecision: string;
    positionId: string | null;
  };
  p137ReadinessStatus: {
    goNoGo: string;
    goNoGoReason: string;
    designatedTargetInAutoApprovedCohort: boolean;
    isP137PrimarySelection: boolean;
    safetyRankScore: number | null;
    confirmations: Record<string, boolean>;
  };
  p138VerificationStatus: {
    overallResult: string;
    goNoGo: string;
    goNoGoReason: string;
    pilotLockApplied: boolean;
    note: string;
  };
  safetyChecklist: Array<{ id: string; label: string; passed: boolean; detail: string }>;
  humanReviewChecklist: HumanReviewChecklistItem[];
  terminalCommands: TerminalCommands;
  rollbackInstructions: RollbackInstructions;
  markdownPath: string;
  jsonPath: string;
  executeBatchCalled: false;
  breezyWrites: false;
  liveModeEnabled: boolean;
  paperworkSent: false;
  continuousRunnerEnabled: boolean;
};
