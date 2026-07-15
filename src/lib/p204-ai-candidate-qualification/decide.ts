import { createHash } from "node:crypto";
import type { BreezyCandidate } from "@/lib/breezy-api";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { isHistoricalApplicant } from "@/lib/candidate-ingestion/candidate-queue-scope";
import { evaluateP193AiQualification } from "@/lib/p193-simplified-autonomous-lifecycle/aiQualification";
import { evaluateP1934Calibration } from "@/lib/p193-4-qualification-calibration/calibratedScorer";
import { scoreTravelRadiusMatch } from "@/lib/recruiting-intelligence/travel-radius";
import type {
  P204QualificationDecision,
  P204ReasonCode,
  P204Recommendation,
} from "@/lib/p204-ai-candidate-qualification/types";

function redacted(id: string): string {
  return createHash("sha256").update(`p204:${id}`).digest("hex").slice(0, 12);
}

function normalizeEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

export function buildEmailDuplicateIndex(candidates: BreezyCandidate[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const c of candidates) {
    const email = normalizeEmail(c.email);
    if (!email.includes("@")) continue;
    counts.set(email, (counts.get(email) ?? 0) + 1);
  }
  return counts;
}

function nextAction(rec: P204Recommendation): string {
  switch (rec) {
    case "advance_paperwork_needed":
      return "Queue for supervised Paperwork Needed promotion (no auto-write in P204)";
    case "reject":
      return "Present reject recommendation to recruiter for confirmation";
    default:
      return "Route to recruiter review queue with evidence packet";
  }
}

/**
 * Read-only qualification decision for one Applied candidate.
 * Composes existing P193 / P193.4 / readiness / territory-adjacent signals.
 */
export function evaluateP204Qualification(input: {
  row: ScoredCandidateWorkflowRow;
  emailCounts: Map<string, number>;
}): P204QualificationDecision {
  const row = input.row;
  const email = normalizeEmail(row.email);
  const sameEmailCount = email.includes("@") ? (input.emailCounts.get(email) ?? 1) : 0;
  const duplicateSuspect = sameEmailCount > 1;
  const historical = isHistoricalApplicant(row);

  const p193 = evaluateP193AiQualification({
    candidate: row,
    workflowStatus: row.workflowStatus,
    questionnaireAnswerCount: row.questionnaireAnswers?.length ?? 0,
    mappedQuestionnaireFieldCount: Object.values(row.questionnaireIntelligence ?? {}).filter(Boolean)
      .length,
    experienceYearsHint: row.aiBreakdown?.yearsOfExperience ?? null,
    // Do not invent a self-distance job; rely on scored-row travel signals when present.
    nearbyJobs: [],
    historicalApplicant: historical,
    duplicateSuspect,
    sameEmailCount,
  });

  const p1934 = evaluateP1934Calibration({
    candidate: row,
    workflowStatus: row.workflowStatus,
    // Duplicates are review signals in P204 — not automatic rejects.
    duplicateActive: false,
    withdrawnOrHeld: /withdraw|archiv|hold|disqual/i.test(row.stage ?? ""),
    nearbyJob: null,
  });

  const readinessScore = row.candidateGrade?.overallScore ?? 0;
  const readinessConfidenceLabel = row.candidateGrade?.confidence ?? "low";
  const readinessConfidence =
    readinessConfidenceLabel === "high" ? 90 : readinessConfidenceLabel === "medium" ? 70 : 40;
  const nearestJobMiles = row.distanceMiles ?? p193.metadata.distanceToNearestWorkMiles ?? null;
  const locationScore =
    nearestJobMiles != null
      ? scoreTravelRadiusMatch(nearestJobMiles, false)
      : row.travelFitScore != null
        ? Math.round(row.travelFitScore)
        : row.city || row.state || row.zipCode
          ? 55
          : 25;
  const questionnaireScore =
    p1934.components.questionnaireScore ?? p193.metadata.questionnaireScore ?? 0;
  const resumeScore = p1934.components.resumeScore ?? p193.metadata.resumeScore ?? row.aiNumericScore ?? 0;
  const experienceYears = p1934.experienceYears ?? p193.metadata.experienceYears ?? null;
  const fraudSpamScore = p193.metadata.fraudSpamScore ?? 0;

  const reasonCodes: P204ReasonCode[] = [];
  const evidence: string[] = [];

  const explicitDisqualify = p1934.hardGates.filter((g) => g.startsWith("explicit_disqualify"));
  const invalidContact = p1934.hardGates.filter((g) => g.startsWith("invalid_contact"));
  const hasQuestionnaire =
    Boolean(row.hasQuestionnaire) || (row.questionnaireAnswers?.length ?? 0) >= 4;
  const hasResume = Boolean(row.hasResume) || Boolean((row.resumeText ?? "").trim());

  if (explicitDisqualify.length > 0) {
    reasonCodes.push("explicit_disqualify");
    evidence.push(`Explicit disqualify gates: ${explicitDisqualify.join(", ")}`);
  }
  if (invalidContact.length > 0) {
    reasonCodes.push("invalid_contact");
    evidence.push(`Contact gates: ${invalidContact.join(", ")}`);
  }
  if (fraudSpamScore >= 50) {
    reasonCodes.push("fraud_spam_indicators");
    evidence.push(`Fraud/spam score=${fraudSpamScore}`);
  }
  if (duplicateSuspect) {
    reasonCodes.push("duplicate_suspect");
    evidence.push(`Same-email count=${sameEmailCount}`);
  }
  if (historical) {
    reasonCodes.push("historical_applicant");
    evidence.push("Applied date outside current MTD window");
  }
  if (!hasResume) {
    reasonCodes.push("missing_resume");
    evidence.push("No resume text available");
  }
  if (!hasQuestionnaire) {
    reasonCodes.push("missing_questionnaire");
    evidence.push("Questionnaire answers missing");
  }
  if (questionnaireScore >= 80) {
    reasonCodes.push("strong_questionnaire");
    evidence.push(`Questionnaire score=${questionnaireScore}`);
  }
  if (resumeScore >= 70) {
    reasonCodes.push("strong_resume");
    evidence.push(`Resume score=${resumeScore}`);
  }
  if (nearestJobMiles != null && nearestJobMiles <= 50) {
    reasonCodes.push("nearby_work_available");
    evidence.push(`Nearest job ~${Math.round(nearestJobMiles)} mi`);
  }
  if (locationScore >= 70) {
    reasonCodes.push("territory_fit");
    evidence.push(`Travel/territory score=${locationScore}`);
  } else if (!(row.city || row.state || row.zipCode)) {
    reasonCodes.push("weak_location_signal");
    evidence.push("Location fields empty");
  }
  if (
    row.questionnaireIntelligence?.availabilityNotes ||
    p1934.mappedFieldsUsed.includes("transportation_license_age")
  ) {
    reasonCodes.push("available_and_transport_ready");
    evidence.push("Availability/transport signals present on questionnaire");
  }
  if (p193.decision === "Qualified") {
    reasonCodes.push("p193_qualified");
    evidence.push(`P193 decision=Qualified conf=${p193.confidenceScore}`);
  }
  if (p193.decision === "Not Qualified") {
    reasonCodes.push("p193_not_qualified");
    evidence.push(`P193 decision=Not Qualified conf=${p193.confidenceScore}`);
  }
  if (p1934.decision === "Qualified") {
    reasonCodes.push("calibrated_qualified");
    evidence.push(`P193.4 decision=Qualified conf=${p1934.confidence}`);
  }
  if (p1934.decision === "Request More Information") {
    reasonCodes.push("calibrated_request_more_info");
    evidence.push(`P193.4 request more info conf=${p1934.confidence}`);
  }

  // Blend confidence (favor calibrated model when questionnaire rich).
  const qRich = (row.questionnaireAnswers?.length ?? 0) >= 8;
  let confidence = Math.round(
    qRich
      ? p1934.confidence * 0.55 + p193.confidenceScore * 0.25 + readinessConfidence * 0.2
      : p193.confidenceScore * 0.45 + p1934.confidence * 0.35 + readinessConfidence * 0.2,
  );
  confidence = Math.max(0, Math.min(100, confidence));

  let recommendation: P204Recommendation;

  // Reject only with clear risk / explicit opt-out — never borderline, never duplicate-alone.
  if (
    explicitDisqualify.length > 0 ||
    (fraudSpamScore >= 70 && confidence < 45 && !p193.borderline) ||
    (p193.decision === "Not Qualified" && fraudSpamScore >= 60 && confidence < 40)
  ) {
    recommendation = "reject";
  } else if (
    // Advance: strong production-safe signals — contact OK, no explicit risk.
    invalidContact.length === 0 &&
    explicitDisqualify.length === 0 &&
    fraudSpamScore < 45 &&
    !duplicateSuspect &&
    hasQuestionnaire &&
    (row.city || row.state || row.zipCode) &&
    ((p193.decision === "Qualified" && confidence >= 72) ||
      (p1934.decision === "Qualified" && confidence >= 78) ||
      (p1934.confidence >= 82 && questionnaireScore >= 75 && confidence >= 75) ||
      (p193.decision === "Qualified" && p1934.confidence >= 78 && hasResume))
  ) {
    recommendation = "advance_paperwork_needed";
    reasonCodes.push("high_qualification_confidence");
    evidence.push(`Advance blend confidence=${confidence}`);
  } else {
    recommendation = "needs_recruiter_review";
    if (p193.borderline || (confidence >= 55 && confidence < 80)) {
      reasonCodes.push("borderline_confidence");
    }
    if (confidence < 55) reasonCodes.push("low_confidence");
    if (p1934.hardGates.length > 0 && explicitDisqualify.length === 0) {
      reasonCodes.push("hard_gate_fail_closed_to_review");
    }
    if (!hasQuestionnaire && !hasResume) {
      reasonCodes.push("insufficient_enriched_signals");
    }
  }

  // Deduplicate reason codes preserving order
  const uniqueReasons = [...new Set(reasonCodes)];

  return {
    candidateId: row.candidateId,
    redactedCandidateId: redacted(row.candidateId),
    workflowStatus: row.workflowStatus,
    recommendation,
    confidence,
    reasonCodes: uniqueReasons,
    evidence: evidence.slice(0, 12),
    recommendedNextAction: nextAction(recommendation),
    components: {
      p193Decision: p193.decision,
      p193Confidence: p193.confidenceScore,
      p1934Decision: p1934.decision,
      p1934Confidence: p1934.confidence,
      readinessScore,
      readinessConfidence,
      resumeScore,
      questionnaireScore,
      locationScore,
      experienceYears,
      nearestJobMiles,
      duplicateSuspect,
      fraudSpamScore,
    },
  };
}
