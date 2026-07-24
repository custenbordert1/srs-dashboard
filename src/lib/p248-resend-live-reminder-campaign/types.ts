export const P248_PHASE = "P248-resend-live-reminder-campaign";
export const P248_CANARY_SIZE = 3;
export const P248_APPROVED_FROM_FALLBACK = "recruiting@strategicretailsolutions.com";
export const P248_APPROVED_FROM_NAME = "Taylor Custenborder";

export type P248ResendConfigCheck = {
  phase: typeof P248_PHASE;
  generatedAt: string;
  integrationPresent: boolean;
  transportFunction: "sendTransactionalEmail";
  requiredEnv: {
    RESEND_API_KEY: { present: boolean; length: number; placeholder: boolean };
    DIRECT_DEPOSIT_EMAIL_MODE: { value: string; liveEnabled: boolean };
    SRS_RECRUITING_FROM_EMAIL: { present: boolean; value: string | null };
    DIRECT_DEPOSIT_FROM: { present: boolean; value: string | null };
    SRS_RECRUITING_REPLY_TO_EMAIL: { present: boolean; value: string | null };
    DIRECT_DEPOSIT_REPLY_TO: { present: boolean; value: string | null };
  };
  resolvedFrom: string;
  resolvedReplyTo: string;
  fromDomain: string;
  canLiveDeliver: boolean;
  secretsSafe: {
    keyNotLogged: true;
    keyNotInArtifacts: true;
    keyNotCommitted: boolean;
  };
  senderVerification: {
    attempted: boolean;
    ok: boolean;
    accountMode: string | null;
    domainStatus: string | null;
    domainVerified: boolean | null;
    canSendExternal: boolean | null;
    detail: string;
  };
  blockers: string[];
  readyForLive: boolean;
};

export type P248FrozenCohortMember = {
  candidateId: string;
  candidateName: string;
  firstName: string;
  email: string;
  breezyPosition: string | null;
  breezyStage: string | null;
  signatureRequestId: string;
  dropboxLiveStatus: string;
  originalPaperworkSentAt: string | null;
  idempotencyKey: string;
  reminderNumber: 1;
  workflowStatus: string;
  paperworkStatus: string;
};

export type P248FrozenCohort = {
  phase: typeof P248_PHASE;
  generatedAt: string;
  previewGeneratedAt: string;
  count: number;
  canaryCandidateIds: string[];
  remainingCandidateIds: string[];
  members: P248FrozenCohortMember[];
};

export type P248CleanupInvalidEmail = {
  candidateId: string;
  candidateName: string;
  invalidEmail: string | null;
  breezyPosition: string | null;
  store: string | null;
  recruiter: string | null;
  districtManager: string | null;
  alternateValidEmail: string | null;
  recommendedCorrection: string;
};

export type P248CleanupMissingSignature = {
  candidateId: string;
  candidateName: string;
  workflowStage: string;
  paperworkStatus: string;
  currentEmail: string | null;
  dropboxRequestFoundByEmail: boolean | null;
  packetNeverCreated: boolean | null;
  internalDataStale: boolean | null;
  recommendedRecoveryAction: string;
};
