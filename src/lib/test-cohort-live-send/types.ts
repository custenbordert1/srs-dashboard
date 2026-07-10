export const P104_SOURCE_PHASE = "P104";

export type ApplicantSendCategory =
  | "safe_to_send_now"
  | "already_sent"
  | "invalid_email"
  | "duplicate_risk"
  | "blocked";

export type ApplicantSendReadiness = {
  applicantKey: string;
  applicantName: string;
  candidateId: string | null;
  email: string;
  category: ApplicantSendCategory;
  safeToSendNow: boolean;
  inP97Cohort: boolean;
  p84EligibleNow: boolean;
  p100Ready: boolean;
  alreadyPaperworkSent: boolean;
  duplicateRisk: boolean;
  invalidEmail: boolean;
  positionTitleEncoding: {
    flagged: boolean;
    detail: string | null;
  };
  blockerReasons: string[];
  recommendation: string;
};

export type TestCohortSendReadinessMetrics = {
  applicantCount: number;
  safeToSendNowCount: number;
  alreadySentCount: number;
  invalidEmailCount: number;
  duplicateRiskCount: number;
  blockedCount: number;
  p84EligibleNowCount: number;
};

export type TestCohortSendExecutionEntry = {
  applicantKey: string;
  applicantName: string;
  candidateId: string;
  email: string;
  mode: "dryRun" | "executeOne";
  outcome: "simulated" | "sent" | "skipped" | "failed";
  signatureRequestId: string | null;
  workflowStatus: string | null;
  onboardingStatus: string | null;
  error: string | null;
  remainingUnsentSafeCandidates: number;
};

export type TestCohortSendReadinessReport = {
  sourcePhase: typeof P104_SOURCE_PHASE;
  generatedAt: string;
  sectionTitle: string;
  p103ValidationGeneratedAt: string;
  metrics: TestCohortSendReadinessMetrics;
  safeToSend: ApplicantSendReadiness[];
  blocked: ApplicantSendReadiness[];
  invalidEmail: ApplicantSendReadiness[];
  duplicateRisk: ApplicantSendReadiness[];
  alreadySent: ApplicantSendReadiness[];
  applicants: ApplicantSendReadiness[];
  executions: TestCohortSendExecutionEntry[];
  needingAction: ApplicantSendReadiness[];
};
