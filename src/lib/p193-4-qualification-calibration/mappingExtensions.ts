import {
  P193_3_QUESTION_ID_MAP,
  P193_3_TEXT_PATTERN_MAP,
  normalizeQuestionText,
  resolveQualificationField,
} from "@/lib/p193-3-questionnaire-capture/questionMapping";
import type { P1933QualificationFieldKey } from "@/lib/p193-3-questionnaire-capture/types";
import type { CandidateQuestionnaireAnswer } from "@/lib/candidate-readiness/types";
import { P193_4_MAPPING_VERSION } from "@/lib/p193-4-qualification-calibration/types";

/**
 * Unambiguous P193.4 mapping additions — Pre-Qualify + 2026 Master IDs/text.
 * Only added when meaning is clear from production samples.
 */
export const P193_4_QUESTION_ID_MAP_ADDITIONS: Record<string, P1933QualificationFieldKey> = {
  // NEW PRE-QUALIFY QUESTIONNAIRE
  "4aeb15a3c56b": "smartphone_ownership",
  "7acf87d19926": "reliable_smartphone_internet",
  "526f296c1764": "transportation_license_age", // "I am 18 years or older"
  "90a4f3039064": "independent_contractor_acknowledgement", // gig/project work acknowledgement
  "120c83bd75f3": "independent_contractor_acknowledgement", // as-needed basis
  "3f30cfeffdef": "scheduling_deadline_acknowledgement",
  "f2a2b372c57e": "scheduling_deadline_acknowledgement",
  "57c42e98dccb": "scheduling_deadline_acknowledgement",
  // 2026 MASTER UPDATED contact fragments
  "1782248710006": "contact_confirmation",
  "1782249561873": "contact_confirmation", // city/market applying
};

export const P193_4_TEXT_PATTERN_ADDITIONS: Array<{
  field: P1933QualificationFieldKey;
  patterns: string[];
}> = [
  { field: "smartphone_ownership", patterns: ["smart device/phone/tablet", "use a smart device"] },
  {
    field: "reliable_smartphone_internet",
    patterns: ["internet via your smart device", "go to the internet via your smart"],
  },
  {
    field: "transportation_license_age",
    patterns: ["i am 18 years or older", "18 years or older"],
  },
  {
    field: "independent_contractor_acknowledgement",
    patterns: [
      "project work (gig work)",
      "not a full- time job",
      "not a full-time job",
      "as needed basis when you have work",
      "as needed basis",
    ],
  },
  {
    field: "scheduling_deadline_acknowledgement",
    patterns: [
      "acceptable not to complete a job",
      "what does a deadline mean",
      "if i can't complete a job",
      "manager refuses to let me complete",
    ],
  },
  {
    field: "contact_confirmation",
    patterns: [
      "confirm your phone number for calls and texts",
      "what city, market, or area are you applying",
      "how far do you live from the area",
    ],
  },
];

export function resolveP1934QualificationField(input: {
  questionId: string | null;
  questionText: string;
}): {
  field: P1933QualificationFieldKey | null;
  mappedBy: "question_id" | "normalized_text" | "unmapped";
  mappingVersion: string;
} {
  if (input.questionId && P193_4_QUESTION_ID_MAP_ADDITIONS[input.questionId]) {
    return {
      field: P193_4_QUESTION_ID_MAP_ADDITIONS[input.questionId]!,
      mappedBy: "question_id",
      mappingVersion: P193_4_MAPPING_VERSION,
    };
  }
  if (input.questionId && P193_3_QUESTION_ID_MAP[input.questionId]) {
    return {
      field: P193_3_QUESTION_ID_MAP[input.questionId]!,
      mappedBy: "question_id",
      mappingVersion: P193_4_MAPPING_VERSION,
    };
  }
  const normalized = normalizeQuestionText(input.questionText);
  for (const entry of [...P193_4_TEXT_PATTERN_ADDITIONS, ...P193_3_TEXT_PATTERN_MAP]) {
    if (entry.patterns.some((p) => normalized.includes(normalizeQuestionText(p)))) {
      return { field: entry.field, mappedBy: "normalized_text", mappingVersion: P193_4_MAPPING_VERSION };
    }
  }
  const fallback = resolveQualificationField(input);
  return { ...fallback, mappingVersion: P193_4_MAPPING_VERSION };
}

export function remapAnswersToFields(
  answers: CandidateQuestionnaireAnswer[],
  existing?: Partial<Record<string, string>>,
): Partial<Record<P1933QualificationFieldKey, string>> {
  const fields: Partial<Record<P1933QualificationFieldKey, string>> = {
    ...(existing as Partial<Record<P1933QualificationFieldKey, string>>),
  };
  for (const answer of answers) {
    if (!answer.answer?.trim()) continue;
    const resolved = resolveP1934QualificationField({
      questionId: null,
      questionText: answer.question,
    });
    if (!resolved.field) continue;
    if (!fields[resolved.field] || !String(fields[resolved.field]).trim()) {
      fields[resolved.field] = answer.answer;
    }
  }
  return fields;
}

export type UnmappedQuestionBucket = {
  questionId: string | null;
  normalizedText: string;
  sampleText: string;
  answerType: string | null;
  frequency: number;
  questionnaireVersion: string | null;
  requiredForQualification: boolean;
  safelyIgnorable: boolean;
  mappingAdded: boolean;
  mappingTarget: P1933QualificationFieldKey | null;
};

export function classifyUnmappedNecessity(text: string): {
  requiredForQualification: boolean;
  safelyIgnorable: boolean;
  mappingTarget: P1933QualificationFieldKey | null;
} {
  const n = normalizeQuestionText(text);
  if (
    /smart device|smartphone|internet via|18 years or older|gig work|as needed basis|deadline mean|confirm your phone|city market or area|how far do you live/.test(
      n,
    )
  ) {
    const resolved = resolveP1934QualificationField({ questionId: null, questionText: text });
    return {
      requiredForQualification: true,
      safelyIgnorable: false,
      mappingTarget: resolved.field,
    };
  }
  if (/none of the above|optional|body>|html/.test(n) || n.length < 8) {
    return { requiredForQualification: false, safelyIgnorable: true, mappingTarget: null };
  }
  // Knowledge-check distractors without clear pass/fail mapping
  if (/what is true about working|when do our merchandisers work for us/.test(n)) {
    return { requiredForQualification: false, safelyIgnorable: true, mappingTarget: null };
  }
  return { requiredForQualification: false, safelyIgnorable: true, mappingTarget: null };
}
