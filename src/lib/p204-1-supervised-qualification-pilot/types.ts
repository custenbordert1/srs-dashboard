/** P204.1 — Supervised AI Qualification Pilot (recommendation metadata only). */

export const P204_1_SOURCE_PHASE = "P204.1" as const;
export const P204_1_SCHEMA_VERSION = 1 as const;
export const P204_1_ENGINE_VERSION = "p204.1.0" as const;
export const P204_1_SCORING_VERSION = "p204+p193.4-calibrated" as const;
export const P204_1_TERRITORY_DATA_VERSION = "p200-row-signals-v1" as const;
export const P204_1_MAX_COHORT = 20 as const;
export const P204_1_ADVANCE_SLOTS = 10 as const;
export const P204_1_REVIEW_SLOTS = 5 as const;
export const P204_1_REJECT_SLOTS = 5 as const;
export const P204_1_ADVANCE_CONFIDENCE_THRESHOLD = 72 as const;
export const P204_1_AUTH_EXPIRATION_HOURS = 24 as const;
export const P204_1_NOTE_MARKER = "[P204_1_AI_RECOMMENDATION]" as const;

export type P2041RecommendationLabel = "Advance" | "Needs Recruiter Review" | "Reject";

export type P2041OperatorDecision =
  | "approve_recommendation"
  | "override_to_review"
  | "override_to_advance"
  | "override_to_reject"
  | "defer"
  | null;

export type P2041AgreementClass =
  | "exact_agreement"
  | "partial_agreement"
  | "disagreement"
  | "ai_more_conservative"
  | "ai_more_aggressive"
  | "insufficient_evidence";

export type P2041FrozenMember = {
  candidateId: string;
  redactedCandidateId: string;
  recommendation: P2041RecommendationLabel;
  confidence: number;
  workflowVersion: number;
  ownershipVersion: number;
  workflowStatus: string;
  paperworkStatus: string | null;
  appliedDate: string;
  state: string;
  city: string;
  positionId: string;
  positionLabel: string;
  questionnaireHash: string;
  resumeHash: string;
  evidenceHash: string;
  sourceTimestamp: string;
  expectedApplied: true;
};

export type P2041FrozenCohort = {
  cohortId: string;
  fingerprint: string;
  frozenAt: string;
  expiresAt: string;
  immutable: true;
  engineVersion: typeof P204_1_ENGINE_VERSION;
  scoringVersion: typeof P204_1_SCORING_VERSION;
  territoryDataVersion: typeof P204_1_TERRITORY_DATA_VERSION;
  schemaVersion: typeof P204_1_SCHEMA_VERSION;
  members: P2041FrozenMember[];
};

export type P2041RecommendationRecord = {
  candidateId: string;
  redactedCandidateId: string;
  cohortId: string;
  fingerprint: string;
  recommendation: P2041RecommendationLabel;
  confidence: number;
  hardGates: string[];
  positiveFactors: string[];
  negativeFactors: string[];
  reasonCodes: string[];
  recruiterExplanation: string;
  evidenceFreshness: string;
  nearbyJobSignal: string;
  questionnaireCompleteness: string;
  duplicateStatus: string;
  recommendedOperatorAction: string;
  engineVersion: string;
  scoringVersion: string;
  evidenceFingerprint: string;
  writtenAt: string;
  workflowStatusAtWrite: string;
  operatorDecision: P2041OperatorDecision;
  operatorDecisionAt: string | null;
  operatorDecisionBy: string | null;
  operatorNotes: string | null;
};

export type P2041OperatorQueueEntry = {
  candidateId: string;
  redactedCandidateId: string;
  candidateDisplayName: string | null;
  recommendation: P2041RecommendationLabel;
  confidence: number;
  topReasons: string[];
  evidenceWarnings: string[];
  nearbyJobs: string;
  currentStage: string;
  allowedDecisions: Exclude<P2041OperatorDecision, null>[];
  operatorDecision: P2041OperatorDecision;
};

export type P2041Authorization = {
  actor: string;
  authorizedAt: string;
  expiresAt: string;
  fingerprint: string;
  allowRecommendationWrites: true;
  allowLifecycleWrites: false;
};
