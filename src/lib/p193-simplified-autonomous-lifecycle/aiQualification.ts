import { scoreCandidate } from "@/lib/candidate-ai-scoring";
import type { BreezyCandidate } from "@/lib/breezy-api";
import {
  distanceMilesForCandidateToJob,
  scoreTravelRadiusMatch,
} from "@/lib/recruiting-intelligence/travel-radius";
import type {
  P193AiDecision,
  P193CandidateMetadata,
} from "@/lib/p193-simplified-autonomous-lifecycle/types";
import { emptyMetadata } from "@/lib/p193-simplified-autonomous-lifecycle/types";

export type P193NearbyJob = {
  jobId: string;
  title: string;
  city: string;
  state: string;
  zip?: string;
};

export type P193AiQualificationInput = {
  candidate: Pick<
    BreezyCandidate,
    | "candidateId"
    | "firstName"
    | "lastName"
    | "email"
    | "phone"
    | "stage"
    | "city"
    | "state"
    | "zipCode"
    | "resumeText"
    | "hasResume"
    | "hasQuestionnaire"
    | "source"
    | "appliedDate"
    | "positionName"
  >;
  workflowStatus?: string | null;
  questionnaireScore?: number | null;
  /** Count of captured questionnaire answers from P193.3 authoritative projection. */
  questionnaireAnswerCount?: number | null;
  /** Mapped Master Questionnaire fields available for qualification. */
  mappedQuestionnaireFieldCount?: number | null;
  experienceYearsHint?: number | null;
  nearbyJobs?: P193NearbyJob[];
  historicalApplicant?: boolean;
  duplicateSuspect?: boolean;
  /** Existing same-email candidates count in store. */
  sameEmailCount?: number;
};

export type P193AiQualificationResult = {
  decision: P193AiDecision;
  confidenceScore: number;
  metadata: Partial<P193CandidateMetadata>;
  reasons: string[];
  borderline: boolean;
};

function estimateExperienceYears(text: string): number | null {
  const m = text.match(/(\d{1,2})\+?\s*\+?\s*years?/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? Math.min(40, n) : null;
}

function fraudSpamScore(input: P193AiQualificationInput): number {
  let score = 0;
  const email = (input.candidate.email ?? "").toLowerCase();
  const source = (input.candidate.source ?? "").toLowerCase();
  if (!email || !email.includes("@")) score += 40;
  if (/test@|asdf|spam|noreply/.test(email)) score += 50;
  if (!input.candidate.phone?.trim()) score += 10;
  if (!input.candidate.hasResume && !input.candidate.resumeText) score += 15;
  if (/bot|scraped/.test(source)) score += 25;
  if ((input.sameEmailCount ?? 0) > 5) score += 20;
  return Math.min(100, score);
}

/**
 * Unified AI qualification — reuses existing scoring utilities.
 * Never auto-rejects borderline candidates (routes to Needs Human Review).
 */
export function evaluateP193AiQualification(
  input: P193AiQualificationInput,
): P193AiQualificationResult {
  const reasons: string[] = [];
  const ai = scoreCandidate(
    input.candidate as BreezyCandidate,
    (input.workflowStatus as "Applied" | "Needs Review" | undefined) ?? "Needs Review",
  );

  const resumeScore = ai.numericScore;
  const answerCount = input.questionnaireAnswerCount ?? 0;
  const mappedCount = input.mappedQuestionnaireFieldCount ?? 0;
  const questionnaireScore =
    input.questionnaireScore ??
    (answerCount >= 12
      ? Math.min(95, 55 + mappedCount * 2)
      : input.candidate.hasQuestionnaire
        ? 60
        : 35);
  const haystack = `${input.candidate.resumeText ?? ""} ${input.candidate.positionName ?? ""}`;
  const experienceYears =
    input.experienceYearsHint ?? estimateExperienceYears(haystack);

  const jobs = input.nearbyJobs ?? [];
  const distances = jobs
    .map((job) => ({
      jobId: job.jobId,
      title: job.title,
      distanceMiles: distanceMilesForCandidateToJob(
        input.candidate.zipCode ?? "",
        input.candidate.city ?? "",
        input.candidate.state ?? "",
        { city: job.city, state: job.state, zip: job.zip },
      ),
    }))
    .sort((a, b) => (a.distanceMiles ?? 9e9) - (b.distanceMiles ?? 9e9));

  const nearest = distances[0]?.distanceMiles ?? null;
  const travelScore = scoreTravelRadiusMatch(nearest, /travel/i.test(haystack));

  const fraud = fraudSpamScore(input);
  const duplicateSuspect = Boolean(input.duplicateSuspect) || (input.sameEmailCount ?? 0) > 1;
  const historical = Boolean(input.historicalApplicant);

  // Confidence blend (0–100)
  let confidence = Math.round(
    resumeScore * 0.45 +
      questionnaireScore * 0.2 +
      travelScore * 0.2 +
      (experienceYears != null ? Math.min(100, experienceYears * 8) : 40) * 0.15,
  );
  confidence = Math.max(0, Math.min(100, confidence - Math.round(fraud * 0.35)));

  if (duplicateSuspect) {
    confidence = Math.min(confidence, 72);
    reasons.push("duplicate_or_multi_application_signal");
  }
  if (historical) reasons.push("historical_applicant");
  if (fraud >= 40) reasons.push("elevated_fraud_spam_indicators");
  if (!input.candidate.hasResume && !input.candidate.resumeText) {
    reasons.push("missing_resume");
  }

  const borderline = confidence >= 55 && confidence < 72;
  let decision: P193AiDecision;

  if (fraud >= 70) {
    decision = "Not Qualified";
    reasons.push("fraud_spam_gate");
  } else if (confidence >= 72 && !borderline) {
    decision = "Qualified";
    reasons.push("confidence_above_auto_qualify");
  } else if (confidence < 45 && fraud >= 50) {
    decision = "Not Qualified";
    reasons.push("low_confidence_and_risk");
  } else {
    // Includes all borderline cases — never auto-reject borderline
    decision = "Needs Human Review";
    reasons.push(borderline ? "borderline_needs_human" : "insufficient_confidence");
  }

  const metadata: Partial<P193CandidateMetadata> = {
    ...emptyMetadata(),
    questionnaireScore,
    resumeScore,
    experienceYears,
    distanceToNearestWorkMiles: nearest,
    nearbyJobs: distances.slice(0, 8).map((d) => ({
      jobId: d.jobId,
      title: d.title,
      distanceMiles: d.distanceMiles,
    })),
    phoneVerified: Boolean(input.candidate.phone?.replace(/\D/g, "").length >= 10),
    emailVerified: Boolean(input.candidate.email?.includes("@")),
    confidenceScore: confidence,
    aiDecision: decision,
    aiSummary: ai.summary,
    fraudSpamScore: fraud,
    duplicateSuspect,
    historicalApplicant: historical,
  };

  return { decision, confidenceScore: confidence, metadata, reasons, borderline };
}
