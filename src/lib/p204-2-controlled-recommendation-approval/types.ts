/** P204.2 — Controlled Recommendation Approval Pilot (operator decisions only). */

export const P204_2_SOURCE_PHASE = "P204.2" as const;
export const P204_2_SCHEMA_VERSION = 1 as const;
export const P204_2_EXPECTED_COHORT_ID = "p204-1-807bd648" as const;
export const P204_2_EXPECTED_FINGERPRINT = "c18a84f889e6bb453c30b0d0" as const;
export const P204_2_NOTE_MARKER = "[P204_2_OPERATOR_DECISION]" as const;
export const P204_2_AUTH_EXPIRATION_HOURS = 24 as const;

export type P2042OperatorDecisionKind =
  | "agree_advance"
  | "agree_review"
  | "agree_reject"
  | "override_to_advance"
  | "override_to_review"
  | "override_to_reject"
  | "defer"
  | "stale_insufficient_evidence";

export type P2042EvidenceChecklist = {
  questionnaire: boolean;
  resumeOrExperience: boolean;
  contactDetails: boolean;
  duplicateIndicators: boolean;
  nearbyWork: boolean;
  hardGates: boolean;
};

export type P2042ReviewPackage = {
  candidateId: string;
  redactedCandidateId: string;
  aiRecommendation: "Advance" | "Needs Recruiter Review" | "Reject";
  confidence: number;
  topPositiveFactors: string[];
  topNegativeFactors: string[];
  hardGateResults: string[];
  questionnaireCompleteness: string;
  experienceSummary: string;
  duplicateStatus: string;
  nearbyJobsCount: number;
  nearestJobDistance: string;
  currentWorkflowStage: string;
  evidenceFreshness: string;
  conciseExplanation: string;
  stale: boolean;
  staleReasons: string[];
  safetyFlags: string[];
};

export type P2042OperatorDecisionRecord = {
  candidateId: string;
  redactedCandidateId: string;
  cohortId: string;
  fingerprint: string;
  aiRecommendation: "Advance" | "Needs Recruiter Review" | "Reject";
  confidence: number;
  decision: P2042OperatorDecisionKind;
  decidedOutcome: "Advance" | "Needs Recruiter Review" | "Reject" | "Deferred" | "Stale";
  isAgreement: boolean;
  isOverride: boolean;
  overrideReason: string | null;
  reviewNotes: string | null;
  evidenceChecklist: P2042EvidenceChecklist;
  operatorId: string;
  decidedAt: string;
  safetyFlags: string[];
  staleReasons: string[];
};

export type P2042Authorization = {
  actor: string;
  authorizedAt: string;
  expiresAt: string;
  cohortId: string;
  fingerprint: string;
  allowOperatorDecisionWrites: true;
  allowLifecycleWrites: false;
};
