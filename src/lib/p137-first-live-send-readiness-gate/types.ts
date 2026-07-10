export const P137_SOURCE_PHASE = "P137";
export const P137_GATE_MODE = "previewOnly" as const;

export type ReadinessGateCandidate = {
  candidateId: string;
  candidateName: string;
  email: string;
  approvalDecision: string;
  approvalScore: number;
  eligibilityStatus: string;
  positionTitle: string | null;
  projectLabel: string | null;
  mappingSource: string;
  templateKey: string | null;
  selectionRank: number;
  selectionReason: string;
  safetyRankScore: number;
  confirmations: {
    validEmail: boolean;
    noDuplicateRisk: boolean;
    noAlreadySent: boolean;
    publishedJobOrApprovedMapping: boolean;
    templateAvailable: boolean;
    cleanAuditHistory: boolean;
  };
};

export type ReadinessSafetyChecklist = {
  noBreezyWrites: boolean;
  executeOneOnly: boolean;
  pilotCapOne: boolean;
  operatorGoRequired: boolean;
  confirmationPhraseRequired: boolean;
  liveModeDisabledByDefault: boolean;
  executeBatchForbidden: boolean;
};

export type PreSendPacketPreview = {
  candidateId: string;
  candidateName: string;
  candidateEmail: string;
  jobOrProject: string;
  paperworkTemplate: string;
  approvalScore: number;
  safetyChecks: Array<{ id: string; label: string; passed: boolean; detail: string }>;
  auditDestination: string;
};

export type FirstLiveSendReadinessGateReport = {
  sourcePhase: typeof P137_SOURCE_PHASE;
  generatedAt: string;
  mode: typeof P137_GATE_MODE;
  p136Summary: {
    autoApprovedCount: number;
    candidatesEvaluated: number;
    schedulerLastCycleAt: string | null;
    readinessCount: number;
  };
  autoApprovedCount: number;
  selectedCandidate: ReadinessGateCandidate;
  backupCandidates: ReadinessGateCandidate[];
  safetyChecklist: ReadinessSafetyChecklist;
  safetyChecks: Array<{ id: string; label: string; passed: boolean; detail: string }>;
  sendPacketPreview: PreSendPacketPreview | null;
  auditPath: string;
  exactEnvVarsNeeded: Record<string, string>;
  allowlistCommand: string;
  finalLiveCommand: string;
  confirmationPhrase: string;
  goNoGo: "GO" | "GO WITH CONDITIONS" | "NO-GO";
  goNoGoReason: string;
  executeBatchCalled: false;
  breezyWrites: false;
  liveModeEnabled: boolean;
  paperworkSent: false;
  continuousRunnerEnabled: boolean;
};
