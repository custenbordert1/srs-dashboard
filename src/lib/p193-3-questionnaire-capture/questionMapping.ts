import type {
  P1933QualificationFieldKey,
} from "@/lib/p193-3-questionnaire-capture/types";

export const P193_3_MAPPING_VERSION = "master-questionnaire-2025-v1";

/**
 * Stable Breezy question IDs observed on Master Questionnaire 2025.
 * Text-fallback patterns are used when IDs are unavailable or change.
 */
export const P193_3_QUESTION_ID_MAP: Record<string, P1933QualificationFieldKey> = {
  "46954e0d688c": "merchandising_experience",
  "60d5277c79d5": "prior_merchandising_vendor_companies",
  "8aaa275eee0d": "contact_confirmation",
  b9032d6ad90c: "reset_types_completed",
  "87238e492c55": "smartphone_ownership",
  "2b4398c4c976": "reliable_smartphone_internet",
  cdcd077b0e09: "comfort_installing_apps",
  "047fc9a75f53": "computer_printer_access",
  "607e2881d605": "photo_and_survey_capability",
  "1fd1f424d955": "scheduling_deadline_acknowledgement",
  "8b7e0234f2ff": "willingness_to_learn_tools",
  db28dda293ca: "transportation_license_age",
  "781dadc5f5df": "daily_email_system_check",
  cfa08bb74e53: "physical_capability",
  "1f00a28ee9a6": "independent_contractor_acknowledgement",
  // Additional Master Questionnaire items vary by version; text map covers them.
};

export const P193_3_TEXT_PATTERN_MAP: Array<{
  field: P1933QualificationFieldKey;
  patterns: string[];
}> = [
  {
    field: "merchandising_experience",
    patterns: ["years of professional merchandising", "merchandising experience"],
  },
  {
    field: "prior_merchandising_vendor_companies",
    patterns: ["merchandising or vendor companies", "vendor companies have you worked"],
  },
  {
    field: "contact_confirmation",
    patterns: ["confirm the following contact details", "zip code", "best phone number"],
  },
  {
    field: "reset_types_completed",
    patterns: ["types of resets have you completed", "resets have you completed"],
  },
  {
    field: "smartphone_ownership",
    patterns: ["android smartphone or iphone", "own an updated android", "smartphone or iphone"],
  },
  {
    field: "reliable_smartphone_internet",
    patterns: ["reliable internet access on your smartphone", "internet access on your smartphone"],
  },
  {
    field: "comfort_installing_apps",
    patterns: ["comfortable installing and using", "third-party apps", "google chrome"],
  },
  {
    field: "computer_printer_access",
    patterns: ["computer or laptop and a printer", "access to a computer or laptop"],
  },
  {
    field: "photo_and_survey_capability",
    patterns: ["50–100", "50-100", "photos and detailed surveys", "uploading"],
  },
  {
    field: "scheduling_deadline_acknowledgement",
    patterns: ["time sensitive", "service schedules", "complete each project by its deadline"],
  },
  {
    field: "willingness_to_learn_tools",
    patterns: ["learn new tools and apps", "follow new client instructions"],
  },
  {
    field: "transportation_license_age",
    patterns: ["reliable transportation", "driver", "18 years of age"],
  },
  {
    field: "daily_email_system_check",
    patterns: ["check your email daily", "log in to our system regularly"],
  },
  {
    field: "physical_capability",
    patterns: ["physical requirements", "stand for extended periods", "lift and carry"],
  },
  {
    field: "independent_contractor_acknowledgement",
    patterns: [
      "not full-time work",
      "1099 independent",
      "project-based work",
      "what type of work is this",
    ],
  },
  {
    field: "reason_for_applying",
    patterns: ["why are you applying", "reason for applying", "what interests you"],
  },
];

export const P193_3_KNOWN_QUESTIONNAIRE_VERSIONS = [
  "Master Questionnaire 2025",
  "Master Questionnaire",
] as const;

export function normalizeQuestionText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function resolveQualificationField(input: {
  questionId: string | null;
  questionText: string;
}): {
  field: P1933QualificationFieldKey | null;
  mappedBy: "question_id" | "normalized_text" | "unmapped";
} {
  if (input.questionId && P193_3_QUESTION_ID_MAP[input.questionId]) {
    return { field: P193_3_QUESTION_ID_MAP[input.questionId]!, mappedBy: "question_id" };
  }
  const normalized = normalizeQuestionText(input.questionText);
  for (const entry of P193_3_TEXT_PATTERN_MAP) {
    if (entry.patterns.some((p) => normalized.includes(normalizeQuestionText(p)))) {
      return { field: entry.field, mappedBy: "normalized_text" };
    }
  }
  return { field: null, mappedBy: "unmapped" };
}

export function isKnownQuestionnaireVersion(title: string | null | undefined): boolean {
  if (!title?.trim()) return false;
  const n = normalizeQuestionText(title);
  return P193_3_KNOWN_QUESTIONNAIRE_VERSIONS.some((v) => n.includes(normalizeQuestionText(v)));
}
