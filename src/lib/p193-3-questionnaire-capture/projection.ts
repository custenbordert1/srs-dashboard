import type { BreezyCandidate } from "@/lib/breezy-api";
import type {
  P1933ClientSafeQuestionnaireProjection,
  P1933QuestionnaireRecord,
  P1933QualificationFieldKey,
} from "@/lib/p193-3-questionnaire-capture/types";

/**
 * Client-safe projection — no fs/db imports. Safe for Client Components.
 */
export function projectQuestionnaireForClient(input: {
  candidateId: string;
  record?: P1933QuestionnaireRecord | null;
  candidate?: Pick<BreezyCandidate, "hasQuestionnaire" | "questionnaireAnswers"> | null;
}): P1933ClientSafeQuestionnaireProjection {
  const record = input.record ?? null;
  const hasQuestionnaire =
    Boolean(record?.flatAnswers.some((a) => a.answer.trim())) ||
    Boolean(input.candidate?.hasQuestionnaire) ||
    (input.candidate?.questionnaireAnswers?.length ?? 0) > 0;

  const answersPreview = (record?.answers ?? [])
    .slice(0, 24)
    .map((a) => ({
      question: a.questionText.slice(0, 160),
      answer: a.normalizedAnswer.slice(0, 160),
      qualificationField: a.qualificationField,
    }));

  return {
    candidateId: input.candidateId,
    hasQuestionnaire,
    completionStatus: record?.completionStatus ?? null,
    answerCount: record?.flatAnswers.length ?? input.candidate?.questionnaireAnswers?.length ?? 0,
    mappedQualificationFields: { ...(record?.mappedQualificationFields ?? {}) },
    questionnaireTitle: record?.questionnaireTitle ?? null,
    questionnaireVersion: record?.questionnaireVersion ?? null,
    fetchedAt: record?.fetchedAt ?? null,
    answersPreview,
  };
}

/** Merge authoritative questionnaire presence onto a candidate for P193 gates. */
export function applyQuestionnaireRecordToCandidate(
  candidate: BreezyCandidate,
  record: P1933QuestionnaireRecord | null | undefined,
): BreezyCandidate {
  if (!record?.flatAnswers.some((a) => a.answer.trim())) return candidate;
  return {
    ...candidate,
    questionnaireAnswers: record.flatAnswers,
    hasQuestionnaire: true,
    questionnaireEnrichmentAttemptedAt: record.fetchedAt,
  };
}

export function qualificationFieldsFromCandidate(
  candidate: BreezyCandidate,
  record?: P1933QuestionnaireRecord | null,
): Partial<Record<P1933QualificationFieldKey, string>> {
  if (record?.mappedQualificationFields) return { ...record.mappedQualificationFields };
  return {};
}
