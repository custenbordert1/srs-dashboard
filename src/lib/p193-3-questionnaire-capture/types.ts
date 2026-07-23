import type { CandidateQuestionnaireAnswer } from "@/lib/candidate-readiness/types";

export const P193_3_SOURCE_PHASE = "P193.3" as const;
export const P193_3_SCHEMA_VERSION = 1 as const;
export const P193_3_BATCH_SIZE = 50;
export const P193_3_CONCURRENCY = 1;
export const P193_3_REQUEST_DELAY_MS = 400;
export const P193_3_MAX_RETRIES = 5;

export type QuestionnaireCompletionStatus =
  | "completed"
  | "incomplete"
  | "unknown"
  | "malformed"
  | "unavailable";

export type P1933ReconciliationClass =
  | "questionnaire_complete_in_breezy_and_captured"
  | "questionnaire_complete_in_breezy_missing_locally"
  | "questionnaire_incomplete_in_breezy"
  | "questionnaire_endpoint_unavailable"
  | "candidate_match_missing"
  | "multiple_questionnaires"
  | "questionnaire_version_unmapped"
  | "malformed_response"
  | "stale_local_copy"
  | "unknown";

/** Canonical Master Questionnaire field keys used by P193 qualification. */
export type P1933QualificationFieldKey =
  | "merchandising_experience"
  | "prior_merchandising_vendor_companies"
  | "reset_types_completed"
  | "smartphone_ownership"
  | "reliable_smartphone_internet"
  | "comfort_installing_apps"
  | "computer_printer_access"
  | "photo_and_survey_capability"
  | "scheduling_deadline_acknowledgement"
  | "willingness_to_learn_tools"
  | "transportation_license_age"
  | "daily_email_system_check"
  | "physical_capability"
  | "independent_contractor_acknowledgement"
  | "reason_for_applying"
  | "contact_confirmation";

export type P1933NormalizedAnswer = {
  questionId: string | null;
  normalizedQuestionKey: string;
  questionText: string;
  answerType: string;
  normalizedAnswer: string;
  originalAnswer: string;
  qualificationField: P1933QualificationFieldKey | null;
  mappedBy: "question_id" | "normalized_text" | "unmapped";
};

export type P1933QuestionnaireRecord = {
  schemaVersion: typeof P193_3_SCHEMA_VERSION;
  candidateId: string;
  breezyCandidateId: string;
  positionId: string | null;
  questionnaireId: string | null;
  questionnaireTitle: string | null;
  questionnaireVersion: string | null;
  completionStatus: QuestionnaireCompletionStatus;
  completedAt: string | null;
  answers: P1933NormalizedAnswer[];
  /** Flat answers compatible with existing ingestion / P193 gates. */
  flatAnswers: CandidateQuestionnaireAnswer[];
  sourceTimestamp: string | null;
  sourceSystem: "breezy";
  contentChecksum: string;
  fetchedAt: string;
  mappedQualificationFields: Partial<Record<P1933QualificationFieldKey, string>>;
  unmappedQuestionCount: number;
  mappingVersion: string;
};

export type P1933CaptureAuditEntry = {
  at: string;
  candidateId: string;
  action: "fetched" | "skipped_unchanged" | "written" | "failed" | "classified";
  classification?: P1933ReconciliationClass;
  contentChecksum?: string;
  error?: string;
};

export type P1933Checkpoint = {
  schemaVersion: typeof P193_3_SCHEMA_VERSION;
  phase: "reconcile" | "backfill";
  updatedAt: string;
  cursorIndex: number;
  candidateIds: string[];
  completedCandidateIds: string[];
  failedCandidateIds: string[];
  systemicFailure: string | null;
  p192PidAtStart: number | null;
};

export type P1933ReconciliationRow = {
  candidateId: string;
  positionId: string | null;
  classification: P1933ReconciliationClass;
  breezyComplete: boolean;
  localCaptured: boolean;
  answerCountBreezy: number;
  answerCountLocal: number;
  questionnaireTitle: string | null;
  questionnaireVersion: string | null;
  mappingFailures: number;
  contentChecksum: string | null;
  error?: string;
};

export type P1933ReconciliationSummary = {
  generatedAt: string;
  totalApplicants: number;
  breezyQuestionnaireComplete: number;
  locallyCaptured: number;
  missingLocally: number;
  incompleteInBreezy: number;
  endpointFailures: number;
  mappingFailures: number;
  potentialP193GateClearAfterBackfill: number;
  classCounts: Record<P1933ReconciliationClass, number>;
};

export type P1933CaptureHealth = {
  generatedAt: string;
  applicantsReceived: number;
  questionnairesCompletedInBreezy: number;
  questionnairesCapturedLocally: number;
  missingCount: number;
  latestBreezyCompletionAt: string | null;
  latestLocalCaptureAt: string | null;
  ingestionLagMinutes: number | null;
  failedFetches: number;
  unmappedQuestionnaireVersions: string[];
  lastSuccessfulBackfillOrCheckpointAt: string | null;
  p193FlagsRemainOff: boolean;
  reminderSendEnabled: false;
  p192Untouched: boolean;
  p192Pid: number | null;
};

export type P1933ClientSafeQuestionnaireProjection = {
  candidateId: string;
  hasQuestionnaire: boolean;
  completionStatus: QuestionnaireCompletionStatus | null;
  answerCount: number;
  mappedQualificationFields: Partial<Record<P1933QualificationFieldKey, string>>;
  questionnaireTitle: string | null;
  questionnaireVersion: string | null;
  fetchedAt: string | null;
  /** Redacted flat answers — question + answer text only when already non-sensitive or truncated. */
  answersPreview: Array<{ question: string; answer: string; qualificationField: string | null }>;
};
