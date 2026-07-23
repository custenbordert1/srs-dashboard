import type { BreezyCandidate } from "@/lib/breezy-api";
import { scoreCandidate } from "@/lib/candidate-ai-scoring";
import {
  distanceMilesForCandidateToJob,
  scoreTravelRadiusMatch,
} from "@/lib/recruiting-intelligence/travel-radius";
import { remapAnswersToFields } from "@/lib/p193-4-qualification-calibration/mappingExtensions";
import type {
  P1934Decision,
  P1934MappedFields,
  P1934ScoreResult,
} from "@/lib/p193-4-qualification-calibration/types";
import {
  P193_4_SCORE_MODEL_VERSION,
  P193_4_THRESHOLD_VERSION,
} from "@/lib/p193-4-qualification-calibration/types";

const WEIGHTS = {
  questionnaire: 0.4,
  experience: 0.2,
  resume: 0.15,
  location: 0.15,
  contactTransport: 0.1,
} as const;

const AFFIRMATIVE_KEYS = [
  "smartphone_ownership",
  "reliable_smartphone_internet",
  "comfort_installing_apps",
  "photo_and_survey_capability",
  "scheduling_deadline_acknowledgement",
  "willingness_to_learn_tools",
  "transportation_license_age",
  "daily_email_system_check",
  "physical_capability",
  "independent_contractor_acknowledgement",
] as const;

function yn(value: string | undefined | null): boolean | null {
  if (value == null || !String(value).trim()) return null;
  const s = String(value).toLowerCase();
  if (/count me out|not what i thought/.test(s)) return false;
  if (/^no\b/.test(s.trim()) || /\bno\b/.test(s) && !/android|iphone|know|not a full/.test(s)) {
    if (/^no$/i.test(s.trim()) || /^no[,.]/.test(s.trim())) return false;
  }
  if (/yes|agree|count me in|1099|android|iphone|able to|fully understand/.test(s)) return true;
  return null;
}

export function parseExperienceYears(value: string | undefined | null): number | null {
  if (!value?.trim()) return null;
  const s = value.toLowerCase();
  if (/less than 1|<\s*1/.test(s)) return 0.5;
  if (/more than 10|>\s*10|10\+/.test(s)) return 12;
  if (/6\s*[–\-]\s*10|6-10/.test(s)) return 8;
  if (/3\s*[–\-]\s*5|3-5/.test(s)) return 4;
  if (/1\s*[–\-]\s*2|1-2/.test(s)) return 1.5;
  const m = s.match(/(\d{1,2})/);
  return m ? Number(m[1]) : null;
}

function collectHardGates(input: {
  candidate: BreezyCandidate;
  fields: P1934MappedFields;
  duplicateActive?: boolean;
  withdrawnOrHeld?: boolean;
}): string[] {
  const hard: string[] = [];
  const c = input.candidate;
  if (!(c.email ?? "").includes("@")) hard.push("invalid_contact_email");
  if (String(c.phone ?? "").replace(/\D/g, "").length < 10) hard.push("invalid_contact_phone");
  if (!c.hasQuestionnaire && !(c.questionnaireAnswers?.length)) hard.push("missing_questionnaire");
  if (!c.positionId?.trim()) hard.push("missing_job");
  if (input.duplicateActive) hard.push("duplicate_active_application");
  if (input.withdrawnOrHeld) hard.push("withdrawn_archived_or_held");

  const ind = String(input.fields.independent_contractor_acknowledgement ?? "");
  if (/count me out|not what i thought/i.test(ind)) hard.push("explicit_disqualify_gig");
  if (/\bw-2 employee\b/i.test(ind) && !/1099/i.test(ind)) {
    hard.push("explicit_disqualify_employment_type");
  }
  const transport = String(input.fields.transportation_license_age ?? "");
  if (/^no$/i.test(transport.trim())) hard.push("explicit_disqualify_transport_age");
  const phone = String(input.fields.smartphone_ownership ?? "");
  if (/^no$/i.test(phone.trim())) hard.push("explicit_disqualify_no_smartphone");

  return hard;
}

function categorizeBlocker(input: {
  decision: P1934Decision;
  hardGates: string[];
  confidence: number;
  questionnaireScore: number;
  mappedCount: number;
}): P1934ScoreResult["blockerCategory"] {
  if (input.decision === "Qualified") return "none_qualified";
  if (input.hardGates.some((h) => h.startsWith("explicit_disqualify") || h.includes("duplicate") || h.includes("fraud"))) {
    return "real_candidate_risk";
  }
  if (input.hardGates.includes("missing_questionnaire") || input.hardGates.includes("missing_job")) {
    return "missing_source_data";
  }
  if (input.mappedCount < 6 && input.questionnaireScore < 70) return "mapping_failure";
  if (input.confidence >= 70 && input.confidence < 90) return "overly_strict_threshold";
  if (input.confidence < 70) return "low_confidence_unavailable_enrichment";
  return "incorrect_scoring";
}

/**
 * P193.4 calibrated qualification.
 * Hard gates fail closed to Needs Human Review (never auto-reject).
 * Thresholds: Qualified ≥90, NHR 70–89, Request More Information <70.
 */
export function evaluateP1934Calibration(input: {
  candidate: BreezyCandidate;
  mappedFields?: P1934MappedFields;
  workflowStatus?: string | null;
  duplicateActive?: boolean;
  withdrawnOrHeld?: boolean;
  nearbyJob?: { city?: string; state?: string; zip?: string } | null;
}): P1934ScoreResult {
  const fields = remapAnswersToFields(
    input.candidate.questionnaireAnswers ?? [],
    input.mappedFields,
  );

  const hardGates = collectHardGates({
    candidate: input.candidate,
    fields,
    duplicateActive: input.duplicateActive,
    withdrawnOrHeld: input.withdrawnOrHeld,
  });

  let affirmative = 0;
  let known = 0;
  for (const key of AFFIRMATIVE_KEYS) {
    const value = fields[key];
    if (value == null || !String(value).trim()) continue;
    known += 1;
    const parsed = yn(String(value));
    if (parsed === true) affirmative += 1;
    if (
      parsed === false &&
      (key === "smartphone_ownership" ||
        key === "transportation_license_age" ||
        key === "independent_contractor_acknowledgement")
    ) {
      affirmative -= 2;
    }
  }

  const questionnaireScore =
    known >= 8
      ? Math.round(55 + (Math.max(0, affirmative) / Math.max(1, known)) * 45)
      : input.candidate.hasQuestionnaire || (input.candidate.questionnaireAnswers?.length ?? 0) > 0
        ? 50
        : 20;

  const years =
    parseExperienceYears(fields.merchandising_experience) ??
    (() => {
      const m = (input.candidate.resumeText ?? "").match(/(\d{1,2})\+?\s*years?/i);
      return m ? Number(m[1]) : null;
    })();
  const experienceScore = years == null ? 45 : Math.min(100, Math.round(years * 10));

  const legacyResumeScore = scoreCandidate(
    input.candidate,
    (input.workflowStatus as "Applied" | "Needs Review" | undefined) ?? "Applied",
  ).numericScore;
  const strongQ = questionnaireScore >= 80 && known >= 10;
  // Soft floor when questionnaire evidence is strong — nonessential thin resume.
  const resumeScore = strongQ && legacyResumeScore < 40 ? Math.max(legacyResumeScore, 55) : legacyResumeScore;

  const nearby = input.nearbyJob ?? {
    city: input.candidate.city ?? undefined,
    state: input.candidate.state ?? undefined,
    zip: input.candidate.zipCode ?? undefined,
  };
  const distance = distanceMilesForCandidateToJob(
    input.candidate.zipCode ?? "",
    input.candidate.city ?? "",
    input.candidate.state ?? "",
    { city: nearby.city ?? "", state: nearby.state ?? "", zip: nearby.zip },
  );
  const locationScore = scoreTravelRadiusMatch(distance ?? 0, false);

  const contactScore =
    ((input.candidate.email ?? "").includes("@") ? 50 : 0) +
    (String(input.candidate.phone ?? "").replace(/\D/g, "").length >= 10 ? 50 : 0);
  const transportYn = yn(fields.transportation_license_age);
  const transportationScore = transportYn === true ? 100 : transportYn === false ? 0 : 50;

  const deductions: P1934ScoreResult["components"]["deductions"] = [];
  let confidence = Math.round(
    questionnaireScore * WEIGHTS.questionnaire +
      experienceScore * WEIGHTS.experience +
      resumeScore * WEIGHTS.resume +
      locationScore * WEIGHTS.location +
      ((contactScore + transportationScore) / 2) * WEIGHTS.contactTransport,
  );

  if (/^no$/i.test(String(fields.computer_printer_access ?? "").trim())) {
    confidence = Math.max(0, confidence - 3);
    deductions.push({
      code: "missing_printer_nonessential",
      points: -3,
      note: "Printer/computer access missing — confidence ding only",
    });
  }

  const weightedBlockers: string[] = [];
  if (questionnaireScore < 70) weightedBlockers.push("questionnaire_evidence_weak");
  if (experienceScore < 40) weightedBlockers.push("experience_evidence_weak");
  if (legacyResumeScore < 40 && !strongQ) weightedBlockers.push("resume_evidence_weak");

  let decision: P1934Decision;
  const reasons: string[] = [];
  if (hardGates.length > 0) {
    decision = "Needs Human Review";
    reasons.push("hard_gate_fail_closed", ...hardGates);
  } else if (confidence >= 90) {
    decision = "Qualified";
    reasons.push("confidence_meets_qualified_threshold");
  } else if (confidence >= 70) {
    decision = "Needs Human Review";
    reasons.push("confidence_in_human_review_band");
  } else {
    decision = "Request More Information";
    reasons.push("confidence_below_seventy_request_more_information");
  }

  const blockerCategory = categorizeBlocker({
    decision,
    hardGates,
    confidence,
    questionnaireScore,
    mappedCount: known,
  });

  return {
    decision,
    confidence,
    components: {
      questionnaireScore,
      resumeScore,
      experienceScore,
      locationScore,
      contactScore,
      transportationScore,
      confidence,
      weights: { ...WEIGHTS },
      deductions,
    },
    hardGates,
    weightedBlockers,
    reasons,
    explanation: `decision=${decision} confidence=${confidence} q=${questionnaireScore} resume=${resumeScore} exp=${experienceScore} loc=${locationScore} hard=${hardGates.join("|") || "none"}`,
    scoreModelVersion: P193_4_SCORE_MODEL_VERSION,
    thresholdVersion: P193_4_THRESHOLD_VERSION,
    mappedFieldsUsed: (Object.keys(fields) as Array<keyof typeof fields>).filter(
      (k) => Boolean(fields[k]),
    ),
    experienceYears: years,
    legacyResumeScore,
    deltaToQualified: Math.max(0, 90 - confidence),
    blockerCategory,
  };
}
