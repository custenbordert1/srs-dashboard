export const P138_SOURCE_PHASE = "P138";
export const P138_VERIFICATION_MODE = "observeOnly" as const;

export type VerificationCheck = {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
};

export type PilotCandidateSnapshot = {
  candidateId: string;
  candidateName: string;
  email: string;
  signatureRequestId: string | null;
  sentAt: string | null;
};

export type AuditVerification = {
  found: boolean;
  outcome: string | null;
  mode: string | null;
  at: string | null;
  auditPath: string;
};

export type DuplicateVerification = {
  inP100SentState: boolean;
  inPilotRegistry: boolean;
  pilotCapExhausted: boolean;
  wouldBlockResend: boolean;
  detail: string;
};

export type PilotSafetyLockStatus = {
  applied: boolean;
  pilotComplete: boolean;
  livePilotDisabled: boolean;
  operatorGoCleared: boolean;
  allowlistCleared: boolean;
  executeOneBlocked: boolean;
  lockedAt: string | null;
  lockedCandidateId: string | null;
  requiredEnvLockdown: Record<string, string>;
};

export type FirstLiveSendVerificationReport = {
  sourcePhase: typeof P138_SOURCE_PHASE;
  generatedAt: string;
  mode: typeof P138_VERIFICATION_MODE;
  candidate: PilotCandidateSnapshot;
  verificationChecklist: VerificationCheck[];
  auditVerification: AuditVerification;
  duplicateVerification: DuplicateVerification;
  safetyLockStatus: PilotSafetyLockStatus;
  overallResult: "PASS" | "FAIL";
  goNoGo: "PASS" | "FAIL";
  goNoGoReason: string;
  recommendations: string[];
  executivePanel: {
    pilotCandidate: string;
    signatureRequestId: string | null;
    timestamp: string | null;
    auditStatus: string;
    duplicateProtection: string;
    pilotLockStatus: string;
    overallResult: "PASS" | "FAIL";
  };
  executeBatchCalled: false;
  breezyWrites: false;
  liveModeEnabled: boolean;
  paperworkSent: false;
};
