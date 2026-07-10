export const P128_SOURCE_PHASE = "P128";
export const P128_SELECTION_MODE = "previewOnly" as const;

export type PilotCandidateSelection = {
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
  confirmations: {
    validEmail: boolean;
    noDuplicateRisk: boolean;
    noAlreadySent: boolean;
    publishedJobOrApprovedMapping: boolean;
    templateAvailable: boolean;
  };
};

export type FirstLivePilotCandidateSelectionReport = {
  sourcePhase: typeof P128_SOURCE_PHASE;
  generatedAt: string;
  mode: typeof P128_SELECTION_MODE;
  p127Summary: {
    totalCandidatesEvaluated: number;
    autoApproved: number;
    humanApproval: number;
    blocked: number;
  };
  selectedCandidate: PilotCandidateSelection;
  backupCandidates: PilotCandidateSelection[];
  safetyChecks: Array<{ id: string; label: string; passed: boolean; detail: string }>;
  sendPacketPreview: import("@/lib/p122-controlled-live-paperwork-pilot/types").PilotSendPacketPreview | null;
  auditPath: string;
  exactEnvVarsNeeded: Record<string, string>;
  allowlistCommand: string;
  finalLiveCommand: string;
  goNoGo: "GO" | "GO WITH CONDITIONS" | "NO-GO";
  goNoGoReason: string;
  executeBatchCalled: false;
  breezyWrites: false;
  liveModeEnabled: boolean;
  paperworkSent: false;
  continuousRunnerEnabled: boolean;
};
