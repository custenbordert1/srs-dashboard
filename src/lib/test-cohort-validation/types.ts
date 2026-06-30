export const P103_SOURCE_PHASE = "P103";
export const P103_PREVIEW_MODE = true as const;

export type TestCohortApplicant = {
  key: string;
  name: string;
  phone: string;
  city: string;
  state: string;
  email: string;
  positionTitle: string;
  cluster?: string;
};

export type ApplicantMatchStatus = "matched" | "unmatched" | "ambiguous";

export type ApplicantDuplicateStatus =
  | "none"
  | "paperwork_already_sent"
  | "duplicate_signature"
  | "onboarding_in_flight";

export type ApplicantContactValidation = {
  emailValid: boolean;
  emailReason: string | null;
  phoneValid: boolean;
  phoneReason: string | null;
};

export type ApplicantP62Preview = {
  recommendedRecruiter: string;
  shouldAssign: boolean;
  confidence: number;
  reason: string;
};

export type ApplicantP83Preview = {
  action: string;
  shouldAdvance: boolean;
  reason: string;
  expectedWorkflowStatus: string;
  expectedActionType: string;
};

export type ApplicantP84Preview = {
  eligible: boolean;
  blockingReasons: string[];
  failedGateIds: string[];
};

export type ApplicantP87Preview = {
  recommendation: string;
  action: string;
  confidence: string;
  paperworkReady: boolean;
};

export type ApplicantP99Preview = {
  ready: boolean;
  blockingReasons: string[];
};

export type ApplicantP100DryRun = {
  inSendQueue: boolean;
  status: "ready" | "blocked" | "sent" | "not_applicable";
  blockingReason: string | null;
};

export type ApplicantValidationResult = {
  applicantKey: string;
  applicantName: string;
  matchStatus: ApplicantMatchStatus;
  matchSignals: string[];
  matchScore: number;
  candidateId: string | null;
  breezyId: string | null;
  positionId: string | null;
  duplicateStatus: ApplicantDuplicateStatus;
  duplicateDetail: string | null;
  contact: ApplicantContactValidation;
  jobStatus: string | null;
  recruiter: string | null;
  dm: string | null;
  workflowStatus: string | null;
  actionType: string | null;
  p62: ApplicantP62Preview | null;
  p83: ApplicantP83Preview | null;
  p84: ApplicantP84Preview | null;
  p87: ApplicantP87Preview | null;
  p99: ApplicantP99Preview | null;
  p100DryRun: ApplicantP100DryRun | null;
  paperworkSendEligible: boolean;
  blockerReason: string | null;
  recommendation: string;
  cluster: string | null;
};

export type TestCohortValidationMetrics = {
  applicantCount: number;
  matchedCount: number;
  unmatchedCount: number;
  ambiguousCount: number;
  duplicateCount: number;
  invalidEmailCount: number;
  invalidPhoneCount: number;
  p84EligibleCount: number;
  sendQueueDryRunCount: number;
  blockedCount: number;
};

export type TestCohortValidationReport = {
  sourcePhase: typeof P103_SOURCE_PHASE;
  previewMode: typeof P103_PREVIEW_MODE;
  generatedAt: string;
  sectionTitle: string;
  cohortLabel: string;
  metrics: TestCohortValidationMetrics;
  clusters: Record<string, string[]>;
  applicants: ApplicantValidationResult[];
  safetyConfirmation: {
    noSends: true;
    noBreezyWrites: true;
    noDropboxCalls: true;
    liveSendForcedFalse: true;
  };
};
