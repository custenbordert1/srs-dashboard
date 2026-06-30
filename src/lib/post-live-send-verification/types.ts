export const P103_SOURCE_PHASE = "P103";
export const P103_FOCUS_CANDIDATE_ID = "6d548b240ab0";
export const P103_FOCUS_CANDIDATE_NAME = "Gary Smigocki";

export type VerificationCheck = {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
};

export type FirstLiveSendVerification = {
  candidateId: string;
  candidateName: string;
  email: string;
  signatureRequestId: string | null;
  checks: VerificationCheck[];
  allPassed: boolean;
  dropboxSignReadOnly: {
    attempted: boolean;
    ok: boolean;
    rawStatus: string | null;
    isComplete: boolean;
    error: string | null;
  };
  workflow: {
    workflowStatus: string | null;
    actionType: string | null;
    paperworkStatus: string | null;
    paperworkSentAt: string | null;
    signatureRequestId: string | null;
  };
  onboarding: {
    onboardingId: string | null;
    status: string | null;
    signatureRequestId: string | null;
    sentAt: string | null;
  } | null;
  p100AuditEntry: {
    found: boolean;
    outcome: string | null;
    at: string | null;
    mode: string | null;
  };
  duplicateProtection: {
    inP100SentState: boolean;
    inReadyQueue: boolean;
    wouldSkipOnResend: boolean;
  };
};

export type RemainingQueueVerification = {
  readyToSend: number;
  alreadySent: number;
  blockedExcludingFocus: number;
  invalidEmailCount: number;
  duplicateRiskCount: number;
  checks: VerificationCheck[];
  allPassed: boolean;
};

export type RemainingSendStrategy = {
  recommendedMode: "executeOne" | "executeBatchRemaining";
  rationale: string;
  executeOneCommand: {
    method: "POST";
    path: "/api/controlled-live-send";
    body: { mode: "executeOne"; executiveApprovalFlag: true };
  };
  executeBatchRemainingCommand: {
    method: "POST";
    path: "/api/controlled-live-send";
    body: {
      mode: "executeBatch";
      executiveApprovalFlag: true;
      confirmationPhrase: string;
      candidateCount: number;
    };
    prerequisite: string;
  };
  batchLockRule: {
    batchMode: "remaining_cohort" | "full_cohort";
    requiredConfirmationPhrase: string;
    requiredCandidateCount: number;
    excludedCandidateIds: string[];
    excludesSignatureRequestIds: boolean;
  };
};

export type PostLiveSendVerificationReport = {
  sourcePhase: typeof P103_SOURCE_PHASE;
  generatedAt: string;
  sectionTitle: "Post-Live Send Verification";
  firstLiveSend: FirstLiveSendVerification;
  remainingQueue: RemainingQueueVerification;
  strategy: RemainingSendStrategy;
  goNoGoRemainingSends: "GO" | "NO-GO";
  goNoGoReason: string;
  artifactPaths: {
    p100Audit: string;
    p100State: string;
    p97Rollback: string;
  };
};
