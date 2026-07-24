export {
  P193_3_SOURCE_PHASE,
  P193_3_SCHEMA_VERSION,
  P193_3_BATCH_SIZE,
  P193_3_CONCURRENCY,
} from "@/lib/p193-3-questionnaire-capture/types";
export type {
  P1933QuestionnaireRecord,
  P1933ReconciliationSummary,
  P1933CaptureHealth,
  P1933ClientSafeQuestionnaireProjection,
  P1933QualificationFieldKey,
} from "@/lib/p193-3-questionnaire-capture/types";

export {
  P193_3_MAPPING_VERSION,
  P193_3_QUESTION_ID_MAP,
  P193_3_TEXT_PATTERN_MAP,
  resolveQualificationField,
  isKnownQuestionnaireVersion,
} from "@/lib/p193-3-questionnaire-capture/questionMapping";

export {
  buildP1933QuestionnaireRecord,
  unwrapQuestionnaireArray,
  checksumOfFlatAnswers,
} from "@/lib/p193-3-questionnaire-capture/normalize";

export { fetchCandidateQuestionnaire, fetchQuestionnairesBounded } from "@/lib/p193-3-questionnaire-capture/fetch";
export {
  classifyQuestionnaireState,
  runP1933Reconciliation,
} from "@/lib/p193-3-questionnaire-capture/reconcile";
export { runP1933Backfill } from "@/lib/p193-3-questionnaire-capture/backfill";
export {
  projectQuestionnaireForClient,
  applyQuestionnaireRecordToCandidate,
} from "@/lib/p193-3-questionnaire-capture/projection";
export { runPostBackfillEligibilityPreview } from "@/lib/p193-3-questionnaire-capture/eligibilityPreview";
export { buildP1933CaptureHealth } from "@/lib/p193-3-questionnaire-capture/captureHealth";
export {
  validateNoLifecycleSideEffects,
  assertQuestionnaireOnlyWrites,
} from "@/lib/p193-3-questionnaire-capture/validate";
