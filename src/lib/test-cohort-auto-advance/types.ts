export const P105_SOURCE_PHASE = "P105";

export const P105_ALREADY_SENT_CANDIDATE_IDS = [
  "9f8231817090", // John Sykes
  "6d548b240ab0", // Gary Smigocki
] as const;

export type ApplicantBlockerDiagnosis = {
  missingRecruiterAssignment: boolean;
  missingDmAssignment: boolean;
  notInP97Cohort: boolean;
  workflowStatusNotPaperworkNeeded: boolean;
  actionTypeNotSendPaperwork: boolean;
  p84GateFailures: string[];
  duplicateRisk: boolean;
  invalidEmail: boolean;
  alreadySent: boolean;
  primaryReasons: string[];
};

export type ApplicantPersistenceResult = {
  applicantKey: string;
  applicantName: string;
  candidateId: string;
  persisted: boolean;
  skippedReason: string | null;
  p84EligibleAfterPersist: boolean;
  recruiter: string | null;
  dm: string | null;
  rollbackId: string | null;
};

export type P105Metrics = {
  applicantCount: number;
  persistedCount: number;
  safeToSendCount: number;
  sentCount: number;
  blockedCount: number;
  invalidEmailCount: number;
  duplicateRiskCount: number;
  alreadySentCount: number;
};

export type P105Report = {
  sourcePhase: typeof P105_SOURCE_PHASE;
  generatedAt: string;
  sectionTitle: string;
  p104ClassificationAt: string | null;
  metrics: P105Metrics;
  diagnoses: Array<{
    applicantKey: string;
    applicantName: string;
    candidateId: string | null;
    diagnosis: ApplicantBlockerDiagnosis;
  }>;
  persisted: ApplicantPersistenceResult[];
  safeToSend: import("@/lib/test-cohort-live-send/types").ApplicantSendReadiness[];
  blocked: import("@/lib/test-cohort-live-send/types").ApplicantSendReadiness[];
  invalidEmail: import("@/lib/test-cohort-live-send/types").ApplicantSendReadiness[];
  duplicateRisk: import("@/lib/test-cohort-live-send/types").ApplicantSendReadiness[];
  alreadySent: import("@/lib/test-cohort-live-send/types").ApplicantSendReadiness[];
  executions: import("@/lib/test-cohort-live-send/types").TestCohortSendExecutionEntry[];
  needingAction: import("@/lib/test-cohort-live-send/types").ApplicantSendReadiness[];
  artifactPaths: {
    p97Audit: string;
    p97Rollback: string;
    p104Artifact: string;
    p105Artifact: string;
  };
};
