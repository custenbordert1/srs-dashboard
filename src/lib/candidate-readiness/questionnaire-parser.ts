import type { BreezyCandidate } from "@/lib/breezy-api";
import type { CandidateQuestionnaireAnswer, CandidateQuestionnaireIntelligence } from "@/lib/candidate-readiness/types";

const NOT_AVAILABLE = "Not available from Breezy yet.";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function stringFromUnknown(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "yes" : "no";
  return "";
}

function normalizeKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function matchesAny(text: string, patterns: string[]): boolean {
  const normalized = normalizeKey(text);
  return patterns.some((pattern) => normalized.includes(pattern));
}

function parseBooleanAnswer(answer: string): boolean | null {
  const value = answer.trim().toLowerCase();
  if (!value) return null;
  if (["yes", "y", "true", "1", "have", "available", "own", "confirmed"].some((term) => value.includes(term))) {
    return true;
  }
  if (["no", "n", "false", "0", "none", "don't", "dont", "not", "without"].some((term) => value.includes(term))) {
    return false;
  }
  return null;
}

const QUESTION_KEY_MAP: Array<{ key: keyof Omit<CandidateQuestionnaireIntelligence, "available" | "answers" | "techReady" | "missingAnswers" | "readinessChecks">; patterns: string[] }> = [
  { key: "merchandisingExperience", patterns: ["merchandis", "reset experience", "field merchandis"] },
  { key: "priorVendorExperience", patterns: ["vendor", "prior company", "previous company", "worked for", "cpg brand"] },
  { key: "smartphoneAccess", patterns: ["smartphone", "smart phone", "mobile phone", "cell phone"] },
  { key: "internetAccess", patterns: ["internet", "wifi", "wi fi", "broadband", "data plan"] },
  { key: "comfortableWithApps", patterns: ["app", "mobile app", "technology comfort", "comfortable with tools"] },
  { key: "printerLaptopAccess", patterns: ["printer", "laptop", "computer access", "home office"] },
  { key: "photoUploadComfort", patterns: ["photo", "upload", "camera", "picture"] },
  { key: "scheduleUnderstanding", patterns: ["schedule", "deadline", "availability window", "understand the schedule"] },
  {
    key: "availabilityNotes",
    patterns: [
      "availability",
      "hours available",
      "when can you work",
      "days available",
      "transportation",
      "reliable transportation",
      "own a vehicle",
      "valid driver",
      "driver license",
      "travel",
    ],
  },
];

function mergeQuestionnaireAnswerSets(
  ...sets: CandidateQuestionnaireAnswer[][]
): CandidateQuestionnaireAnswer[] {
  const seen = new Map<string, CandidateQuestionnaireAnswer>();
  for (const set of sets) {
    for (const answer of set) {
      const key = answer.normalizedKey || (answer.question ? normalizeKey(answer.question) : "");
      if (!key && !answer.answer.trim()) continue;
      seen.set(key || `answer:${seen.size}`, answer);
    }
  }
  return [...seen.values()];
}

function extractAnswersFromQuestionRecords(records: unknown[]): CandidateQuestionnaireAnswer[] {
  const answers: CandidateQuestionnaireAnswer[] = [];
  for (const entry of records) {
    const record = asRecord(entry);
    if (!record) continue;
    const question =
      stringFromUnknown(record.question) ||
      stringFromUnknown(record.text) ||
      stringFromUnknown(record.title) ||
      stringFromUnknown(record.name) ||
      stringFromUnknown(record.label) ||
      stringFromUnknown(record.prompt);
    const answer =
      stringFromUnknown(record.answer) ||
      stringFromUnknown(record.value) ||
      stringFromUnknown(record.response) ||
      stringFromUnknown(record.text_value) ||
      stringFromUnknown(record.text);
    if (!question && !answer) continue;
    answers.push({
      question: question || "Question",
      answer: answer || "",
      normalizedKey: question ? normalizeKey(question) : undefined,
    });
  }
  return answers;
}

/** Parse Breezy `/candidate/:id/questionnaires` payload into normalized answers. */
export function extractQuestionnaireAnswersFromBreezyQuestionnaires(
  data: unknown,
): CandidateQuestionnaireAnswer[] {
  if (!Array.isArray(data)) return [];
  const answers: CandidateQuestionnaireAnswer[] = [];
  for (const questionnaire of data) {
    const record = asRecord(questionnaire);
    if (!record) continue;
    for (const key of ["questions", "responses", "answers", "items", "fields"]) {
      const section = record[key];
      if (Array.isArray(section)) {
        answers.push(...extractAnswersFromQuestionRecords(section));
      }
    }
  }
  return answers;
}

/** Parse Breezy `/candidate/:id/custom-fields` payload into normalized answers. */
export function extractQuestionnaireAnswersFromBreezyCustomFields(
  data: unknown,
): CandidateQuestionnaireAnswer[] {
  if (!Array.isArray(data)) return [];
  return extractAnswersFromQuestionRecords(
    data.map((entry) => {
      const record = asRecord(entry);
      if (!record) return entry;
      return {
        name: record.name ?? record.label ?? record.question ?? record.title,
        value: record.value ?? record.answer ?? record.response ?? record.text,
      };
    }),
  );
}

/** Combine questionnaire answers from Breezy detail, questionnaires, and custom-fields payloads. */
export function buildQuestionnaireAnswersFromEnrichmentPayload(payload: {
  detail?: Record<string, unknown> | null;
  questionnaires?: unknown;
  customFields?: unknown;
}): CandidateQuestionnaireAnswer[] {
  const fromDetail = payload.detail ? extractQuestionnaireAnswersFromRaw(payload.detail) : [];
  const fromQuestionnaires = extractQuestionnaireAnswersFromBreezyQuestionnaires(payload.questionnaires);
  const fromCustomFields = extractQuestionnaireAnswersFromBreezyCustomFields(payload.customFields);
  return mergeQuestionnaireAnswerSets(fromDetail, fromQuestionnaires, fromCustomFields);
}

export function applyQuestionnaireAnswersToCandidate(
  candidate: BreezyCandidate,
  answers: CandidateQuestionnaireAnswer[],
): BreezyCandidate {
  if (answers.length === 0) return candidate;
  return {
    ...candidate,
    questionnaireAnswers: answers,
    hasQuestionnaire: true,
  };
}

/** Extract normalized questionnaire answers from raw Breezy payload at sync time. */
export function extractQuestionnaireAnswersFromRaw(
  raw: Record<string, unknown>,
): CandidateQuestionnaireAnswer[] {
  const answers: CandidateQuestionnaireAnswer[] = [];

  const customAttributes = raw.custom_attributes;
  if (Array.isArray(customAttributes)) {
    for (const entry of customAttributes) {
      const record = asRecord(entry);
      if (!record) continue;
      const question = stringFromUnknown(record.name) || stringFromUnknown(record.label) || stringFromUnknown(record.question);
      const answer = stringFromUnknown(record.value) || stringFromUnknown(record.answer);
      if (!question && !answer) continue;
      answers.push({
        question: question || "Custom attribute",
        answer: answer || "",
        normalizedKey: question ? normalizeKey(question) : undefined,
      });
    }
  }

  const screeningQuestions = raw.screening_questions ?? raw.questionnaire ?? raw.application_questions;
  if (Array.isArray(screeningQuestions)) {
    for (const entry of screeningQuestions) {
      const record = asRecord(entry);
      if (!record) continue;
      const question =
        stringFromUnknown(record.question) ||
        stringFromUnknown(record.name) ||
        stringFromUnknown(record.label) ||
        stringFromUnknown(record.title);
      const answer =
        stringFromUnknown(record.answer) ||
        stringFromUnknown(record.value) ||
        stringFromUnknown(record.response);
      if (!question && !answer) continue;
      answers.push({
        question: question || "Screening question",
        answer: answer || "",
        normalizedKey: question ? normalizeKey(question) : undefined,
      });
    }
  }

  return answers;
}

function resolveQuestionnaireAnswers(candidate: BreezyCandidate): CandidateQuestionnaireAnswer[] {
  if (candidate.questionnaireAnswers?.length) return candidate.questionnaireAnswers;

  const customText = candidate.resumeFields?.customAttributesText?.trim();
  if (!customText) return [];

  // Flattened custom attribute text often includes Q&A fragments — surface as raw answers.
  return [{ question: "Application responses", answer: customText, normalizedKey: "application responses" }];
}

function findAnswerForKey(
  answers: CandidateQuestionnaireAnswer[],
  patterns: string[],
): CandidateQuestionnaireAnswer | undefined {
  return answers.find((entry) => {
    const haystack = `${entry.question} ${entry.normalizedKey ?? ""} ${entry.answer}`;
    return matchesAny(haystack, patterns);
  });
}

function resolveTechReady(
  smartphone: boolean | null,
  internet: boolean | null,
  apps: boolean | null,
): boolean | null {
  const checks = [smartphone, internet, apps];
  if (checks.some((value) => value === false)) return false;
  if (checks.every((value) => value === true)) return true;
  return null;
}

function unavailableQuestionnaire(): CandidateQuestionnaireIntelligence {
  return {
    available: false,
    answers: [],
    merchandisingExperience: null,
    priorVendorExperience: null,
    smartphoneAccess: null,
    internetAccess: null,
    comfortableWithApps: null,
    printerLaptopAccess: null,
    photoUploadComfort: null,
    scheduleUnderstanding: null,
    availabilityNotes: null,
    techReady: null,
    missingAnswers: [NOT_AVAILABLE],
    readinessChecks: [
      { label: "Smartphone access", passed: null },
      { label: "Internet access", passed: null },
      { label: "Comfort with apps/tools", passed: null },
      { label: "Printer/laptop access", passed: null },
      { label: "Photo/upload comfort", passed: null },
      { label: "Schedule/deadline understanding", passed: null },
    ],
  };
}

export function buildQuestionnaireIntelligence(
  candidate: BreezyCandidate,
): CandidateQuestionnaireIntelligence {
  const answers = resolveQuestionnaireAnswers(candidate);
  if (answers.length === 0) return unavailableQuestionnaire();

  const fields: Partial<CandidateQuestionnaireIntelligence> = {
    available: true,
    answers,
  };

  for (const mapping of QUESTION_KEY_MAP) {
    const match = findAnswerForKey(answers, mapping.patterns);
    if (!match?.answer) continue;

    if (mapping.key === "merchandisingExperience" || mapping.key === "priorVendorExperience" || mapping.key === "availabilityNotes") {
      fields[mapping.key] = match.answer;
    } else {
      fields[mapping.key] = parseBooleanAnswer(match.answer);
    }
  }

  const techReady = resolveTechReady(
    fields.smartphoneAccess ?? null,
    fields.internetAccess ?? null,
    fields.comfortableWithApps ?? null,
  );

  const missingAnswers: string[] = [];
  for (const mapping of QUESTION_KEY_MAP) {
    const match = findAnswerForKey(answers, mapping.patterns);
    if (!match?.answer?.trim()) {
      missingAnswers.push(mapping.patterns[0] ?? String(mapping.key));
    }
  }

  const readinessChecks = [
    { label: "Smartphone access", passed: fields.smartphoneAccess ?? null },
    { label: "Internet access", passed: fields.internetAccess ?? null },
    { label: "Comfort with apps/tools", passed: fields.comfortableWithApps ?? null },
    { label: "Printer/laptop access", passed: fields.printerLaptopAccess ?? null },
    { label: "Photo/upload comfort", passed: fields.photoUploadComfort ?? null },
    { label: "Schedule/deadline understanding", passed: fields.scheduleUnderstanding ?? null },
  ];

  return {
    available: true,
    answers,
    merchandisingExperience: fields.merchandisingExperience ?? null,
    priorVendorExperience: fields.priorVendorExperience ?? null,
    smartphoneAccess: fields.smartphoneAccess ?? null,
    internetAccess: fields.internetAccess ?? null,
    comfortableWithApps: fields.comfortableWithApps ?? null,
    printerLaptopAccess: fields.printerLaptopAccess ?? null,
    photoUploadComfort: fields.photoUploadComfort ?? null,
    scheduleUnderstanding: fields.scheduleUnderstanding ?? null,
    availabilityNotes: fields.availabilityNotes ?? null,
    techReady,
    missingAnswers,
    readinessChecks,
  };
}
