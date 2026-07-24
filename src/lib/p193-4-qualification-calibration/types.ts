import type { CandidateQuestionnaireAnswer } from "@/lib/candidate-readiness/types";

export const P193_4_SOURCE_PHASE = "P193.4" as const;
export const P193_4_SCHEMA_VERSION = 1 as const;
export const P193_4_SCORE_MODEL_VERSION = "p193-4-q-weighted-v1";
export const P193_4_THRESHOLD_VERSION = "qualified-90-nhro-70-rmi-below-70";
export const P193_4_MAPPING_VERSION = "master-prequalify-2025-2026-v2";
export const P193_4_MAX_COHORT = 10;
export const P193_4_MIN_QUALIFIED_TO_BRIDGE = 3;
export const P193_4_AUTH_EXPIRATION_HOURS = 24;

export type P1934Decision = "Qualified" | "Needs Human Review" | "Request More Information";

export type P1934ScoreComponents = {
  questionnaireScore: number;
  resumeScore: number;
  experienceScore: number;
  locationScore: number;
  contactScore: number;
  transportationScore: number;
  confidence: number;
  weights: {
    questionnaire: number;
    experience: number;
    resume: number;
    location: number;
    contactTransport: number;
  };
  deductions: Array<{ code: string; points: number; note: string }>;
};

export type P1934ScoreResult = {
  decision: P1934Decision;
  confidence: number;
  components: P1934ScoreComponents;
  hardGates: string[];
  weightedBlockers: string[];
  reasons: string[];
  explanation: string;
  scoreModelVersion: typeof P193_4_SCORE_MODEL_VERSION;
  thresholdVersion: typeof P193_4_THRESHOLD_VERSION;
  mappedFieldsUsed: string[];
  experienceYears: number | null;
  legacyResumeScore: number;
  deltaToQualified: number;
  blockerCategory:
    | "real_candidate_risk"
    | "missing_source_data"
    | "mapping_failure"
    | "incorrect_scoring"
    | "overly_strict_threshold"
    | "low_confidence_unavailable_enrichment"
    | "none_qualified";
};

export type P1934MappedFields = Partial<Record<string, string>>;

export type P1934PilotMember = {
  candidateId: string;
  positionId: string;
  positionName: string;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  emailHash: string;
  phoneHash: string;
  decision: P1934Decision;
  confidence: number;
  legacyWorkflowStatus: string | null;
};

export type P1934FrozenCohort = {
  schemaVersion: typeof P193_4_SCHEMA_VERSION;
  pilotId: string;
  fingerprint: string;
  frozenAt: string;
  expiresAt: string;
  immutable: true;
  scoreModelVersion: typeof P193_4_SCORE_MODEL_VERSION;
  thresholdVersion: typeof P193_4_THRESHOLD_VERSION;
  mappingVersion: typeof P193_4_MAPPING_VERSION;
  maxSize: number;
  members: P1934PilotMember[];
  sourceVersions: {
    ingestionUpdatedAt: string | null;
    questionnaireStoreUpdatedAt: string | null;
  };
};

export type P1934QuestionnaireAnswers = CandidateQuestionnaireAnswer[];
