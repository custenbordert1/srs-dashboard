import { createHash } from "node:crypto";
import type { CandidateQuestionnaireAnswer } from "@/lib/candidate-readiness/types";
import {
  buildQuestionnaireAnswersFromEnrichmentPayload,
  extractQuestionnaireAnswersFromBreezyQuestionnaires,
} from "@/lib/candidate-readiness/questionnaire-parser";
import {
  P193_3_MAPPING_VERSION,
  isKnownQuestionnaireVersion,
  normalizeQuestionText,
  resolveQualificationField,
} from "@/lib/p193-3-questionnaire-capture/questionMapping";
import type {
  P1933NormalizedAnswer,
  P1933QuestionnaireRecord,
  QuestionnaireCompletionStatus,
} from "@/lib/p193-3-questionnaire-capture/types";
import { P193_3_SCHEMA_VERSION } from "@/lib/p193-3-questionnaire-capture/types";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringFromUnknown(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "yes" : "no";
  return "";
}

/** Unwrap Breezy payloads that nest questionnaires under a common envelope. */
export function unwrapQuestionnaireArray(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  const record = asRecord(data);
  if (!record) return [];
  for (const key of ["questionnaires", "data", "items", "results"]) {
    if (Array.isArray(record[key])) return record[key] as unknown[];
  }
  return [];
}

function extractCheckboxAnswer(record: Record<string, unknown>): string {
  const responses = record.responses;
  const options = record.options;
  if (!Array.isArray(responses) || !Array.isArray(options)) return "";
  const selected: string[] = [];
  for (let i = 0; i < Math.min(responses.length, options.length); i += 1) {
    if (responses[i] !== true) continue;
    const option = asRecord(options[i]);
    const label =
      (option &&
        (stringFromUnknown(option.text) ||
          stringFromUnknown(option.label) ||
          stringFromUnknown(option.name))) ||
      "";
    if (label) selected.push(label);
  }
  return selected.join(", ");
}

function extractAnswerText(record: Record<string, unknown>): string {
  const checkbox = extractCheckboxAnswer(record);
  if (checkbox) return checkbox;
  return (
    stringFromUnknown(record.response) ||
    stringFromUnknown(record.answer) ||
    stringFromUnknown(record.value) ||
    stringFromUnknown(record.text_value) ||
    stringFromUnknown(record.selected)
  );
}

function extractQuestionRecords(questionnaire: Record<string, unknown>): unknown[] {
  const records: unknown[] = [];
  if (Array.isArray(questionnaire.sections)) {
    for (const section of questionnaire.sections) {
      const sectionRecord = asRecord(section);
      if (!sectionRecord) continue;
      if (Array.isArray(sectionRecord.questions)) records.push(...sectionRecord.questions);
    }
  }
  // Prefer section questions; only use top-level questions when sections are empty
  // to avoid double-counting Master Questionnaire 2025 payloads that include both.
  if (records.length === 0) {
    for (const key of ["questions", "responses", "answers", "items", "fields"]) {
      if (Array.isArray(questionnaire[key])) records.push(...(questionnaire[key] as unknown[]));
    }
  }
  return records;
}

function contentChecksum(parts: unknown): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

function completionFromQuestionnaire(record: Record<string, unknown>, answerCount: number): QuestionnaireCompletionStatus {
  const status = stringFromUnknown(record.status).toLowerCase();
  if (status === "completed" || status === "complete") return "completed";
  if (answerCount > 0) return "completed";
  if (status === "incomplete" || status === "pending" || status === "sent") return "incomplete";
  return answerCount > 0 ? "completed" : "incomplete";
}

function toNormalizedAnswers(questionRecords: unknown[]): {
  answers: P1933NormalizedAnswer[];
  flat: CandidateQuestionnaireAnswer[];
} {
  const answers: P1933NormalizedAnswer[] = [];
  const flat: CandidateQuestionnaireAnswer[] = [];
  const seen = new Set<string>();

  for (const entry of questionRecords) {
    const record = asRecord(entry);
    if (!record) continue;
    const questionText =
      stringFromUnknown(record.text) ||
      stringFromUnknown(record.question) ||
      stringFromUnknown(record.title) ||
      stringFromUnknown(record.name) ||
      stringFromUnknown(record.label);
    const answerText = extractAnswerText(record);
    if (!questionText && !answerText) continue;
    const questionId = stringFromUnknown(record._id) || stringFromUnknown(record.id) || null;
    const typeRecord = asRecord(record.type);
    const answerType =
      stringFromUnknown(typeRecord?.id) ||
      stringFromUnknown(typeRecord?.name) ||
      stringFromUnknown(record.question_type) ||
      "unknown";
    const resolved = resolveQualificationField({ questionId, questionText });
    const normalizedQuestionKey = normalizeQuestionText(questionText || questionId || answerText);
    const dedupe = `${questionId ?? ""}|${normalizedQuestionKey}|${answerText}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);

    answers.push({
      questionId,
      normalizedQuestionKey,
      questionText: questionText || "Question",
      answerType,
      normalizedAnswer: answerText,
      originalAnswer: answerText,
      qualificationField: resolved.field,
      mappedBy: resolved.mappedBy,
    });
    flat.push({
      question: questionText || "Question",
      answer: answerText,
      normalizedKey: normalizedQuestionKey || undefined,
    });
  }

  return { answers, flat };
}

export function buildP1933QuestionnaireRecord(input: {
  candidateId: string;
  positionId: string | null;
  payload: {
    detail?: Record<string, unknown> | null;
    questionnaires?: unknown;
    customFields?: unknown;
  };
  fetchedAt?: string;
}): P1933QuestionnaireRecord {
  const fetchedAt = input.fetchedAt ?? new Date().toISOString();
  const questionnaires = unwrapQuestionnaireArray(input.payload.questionnaires);
  const primary = asRecord(questionnaires[0]) ?? null;

  const questionRecords: unknown[] = [];
  for (const q of questionnaires) {
    const record = asRecord(q);
    if (record) questionRecords.push(...extractQuestionRecords(record));
  }

  // Also fold detail.questionnaire + custom fields via existing parser for coverage.
  const fromLegacy = buildQuestionnaireAnswersFromEnrichmentPayload(input.payload);
  const fromArrayParser = extractQuestionnaireAnswersFromBreezyQuestionnaires(questionnaires);

  let { answers, flat } = toNormalizedAnswers(questionRecords);

  // Merge any legacy-parsed answers missing from structured walk.
  for (const legacy of [...fromLegacy, ...fromArrayParser]) {
    const key = normalizeQuestionText(`${legacy.question}|${legacy.answer}`);
    if (flat.some((a) => normalizeQuestionText(`${a.question}|${a.answer}`) === key)) continue;
    const resolved = resolveQualificationField({ questionId: null, questionText: legacy.question });
    answers.push({
      questionId: null,
      normalizedQuestionKey: normalizeQuestionText(legacy.question),
      questionText: legacy.question,
      answerType: "legacy",
      normalizedAnswer: legacy.answer,
      originalAnswer: legacy.answer,
      qualificationField: resolved.field,
      mappedBy: resolved.mappedBy,
    });
    flat.push(legacy);
  }

  const title =
    (primary &&
      (stringFromUnknown(primary.name) || stringFromUnknown(primary.title))) ||
    null;
  const questionnaireId =
    (primary &&
      (stringFromUnknown(primary.questionnaire_id) ||
        stringFromUnknown(primary._id) ||
        stringFromUnknown(primary.id))) ||
    null;
  const sourceTimestamp =
    (primary &&
      (stringFromUnknown(primary.updated_date) ||
        stringFromUnknown(primary.creation_date) ||
        stringFromUnknown(primary.completed_date))) ||
    null;

  const completionStatus = primary
    ? completionFromQuestionnaire(primary, flat.filter((a) => a.answer.trim()).length)
    : flat.some((a) => a.answer.trim())
      ? "completed"
      : questionnaires.length === 0
        ? "incomplete"
        : "unknown";

  const mappedQualificationFields: P1933QuestionnaireRecord["mappedQualificationFields"] = {};
  let unmappedQuestionCount = 0;
  for (const answer of answers) {
    if (answer.qualificationField) {
      mappedQualificationFields[answer.qualificationField] = answer.normalizedAnswer;
    } else {
      unmappedQuestionCount += 1;
    }
  }

  const checksumPayload = {
    questionnaireId,
    title,
    answers: answers.map((a) => ({
      id: a.questionId,
      key: a.normalizedQuestionKey,
      answer: a.normalizedAnswer,
    })),
  };

  return {
    schemaVersion: P193_3_SCHEMA_VERSION,
    candidateId: input.candidateId,
    breezyCandidateId: input.candidateId,
    positionId: input.positionId,
    questionnaireId,
    questionnaireTitle: title,
    questionnaireVersion: title,
    completionStatus,
    completedAt: completionStatus === "completed" ? sourceTimestamp || fetchedAt : null,
    answers,
    flatAnswers: flat,
    sourceTimestamp,
    sourceSystem: "breezy",
    contentChecksum: contentChecksum(checksumPayload),
    fetchedAt,
    mappedQualificationFields,
    unmappedQuestionCount,
    mappingVersion: P193_3_MAPPING_VERSION,
  };
}

export function questionnaireVersionUnmapped(record: P1933QuestionnaireRecord): boolean {
  if (!record.questionnaireTitle) return record.flatAnswers.length > 0;
  return !isKnownQuestionnaireVersion(record.questionnaireTitle);
}

export function checksumOfFlatAnswers(answers: CandidateQuestionnaireAnswer[] | undefined): string {
  return contentChecksum(
    (answers ?? []).map((a) => ({
      q: normalizeQuestionText(a.question),
      a: a.answer.trim(),
    })),
  );
}
