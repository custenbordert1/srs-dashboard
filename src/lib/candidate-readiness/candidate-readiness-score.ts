import type { BreezyCandidate } from "@/lib/breezy-api";
import type {
  CandidateQuestionnaireIntelligence,
  CandidateReadinessCategoryScores,
  CandidateReadinessGrade,
  CandidateReadinessScore,
  CandidateResumeIntelligence,
} from "@/lib/candidate-readiness/types";
import {
  buildGradeContributors,
  buildReadinessConfidence,
  hasNoMerchandisingAnswer,
} from "@/lib/candidate-readiness/build-grade-explainability";

const NEUTRAL_SCORE = 60;

function clamp(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function gradeFromScore(score: number): CandidateReadinessGrade {
  if (score >= 82) return "A";
  if (score >= 70) return "B";
  if (score >= 58) return "C";
  return "D";
}

function scoreRetailMerchandising(
  resume: CandidateResumeIntelligence,
  questionnaire: CandidateQuestionnaireIntelligence,
  haystack: string,
): number {
  let score = 50;
  if (resume.merchandisingRetailExperience) score += 22;
  if (resume.phoneCustomerServiceExperience) score += 12;
  if (resume.signalBadges.some((badge) => badge.id === "retail" && badge.detected)) score += 10;
  if (resume.signalBadges.some((badge) => badge.id === "customer_service" && badge.detected)) score += 8;
  if (resume.signalBadges.some((badge) => badge.id === "merchandising" && badge.detected)) score += 8;
  if (questionnaire.merchandisingExperience) {
    const answer = questionnaire.merchandisingExperience.toLowerCase();
    if (hasNoMerchandisingAnswer(questionnaire.merchandisingExperience)) score -= 12;
    else if (/\b(3|4|5|6|7|8|9|10|\d{2,})\b/.test(answer) || answer.includes("year")) score += 15;
    else if (answer.includes("month") || answer.includes("1")) score += 6;
    else score += 10;
  }
  if (haystack.includes("reset") || haystack.includes("planogram")) score += 8;
  if (haystack.includes("walmart") || haystack.includes("target")) score += 6;
  return clamp(score);
}

function scoreReliability(
  resume: CandidateResumeIntelligence,
  questionnaire: CandidateQuestionnaireIntelligence,
): number {
  let score = NEUTRAL_SCORE;
  if (questionnaire.scheduleUnderstanding === true) score += 12;
  if (questionnaire.availabilityNotes?.trim()) score += 8;
  if (resume.employmentGaps.length === 0 && resume.available) score += 8;
  if (resume.employmentGaps.length > 0) score -= resume.employmentGaps.length * 5;
  return clamp(score);
}

function scoreTechnology(questionnaire: CandidateQuestionnaireIntelligence): number {
  if (!questionnaire.available) return NEUTRAL_SCORE;

  let score = NEUTRAL_SCORE;
  if (questionnaire.smartphoneAccess === true) score += 10;
  if (questionnaire.internetAccess === true) score += 10;
  if (questionnaire.comfortableWithApps === true) score += 10;
  if (questionnaire.printerLaptopAccess === true) score += 5;
  if (questionnaire.photoUploadComfort === true) score += 5;
  if (questionnaire.smartphoneAccess === false) score -= 12;
  if (questionnaire.internetAccess === false) score -= 12;
  if (questionnaire.comfortableWithApps === false) score -= 8;
  return clamp(score);
}

function scoreCommunication(resume: CandidateResumeIntelligence, candidate: BreezyCandidate): number {
  let score = NEUTRAL_SCORE;
  if (candidate.phone?.trim()) score += 10;
  if (candidate.email?.trim()) score += 5;
  if (resume.phoneCustomerServiceExperience) score += 15;
  if (resume.signalBadges.some((badge) => badge.id === "customer_service" && badge.detected)) score += 10;
  if (resume.summary && resume.summary.length > 40) score += 5;
  return clamp(score);
}

function scoreProjectFit(resume: CandidateResumeIntelligence, haystack: string): number {
  let score = NEUTRAL_SCORE;
  if (resume.relevantSkills.length >= 3) score += 15;
  else if (resume.relevantSkills.length >= 1) score += 8;
  if (resume.signalBadges.some((badge) => badge.id === "travel" && badge.detected)) score += 10;
  else if (haystack.includes("travel") || haystack.includes("mile")) score += 8;
  if (resume.workHistoryHighlights.length >= 2) score += 8;
  if (resume.signalBadges.some((badge) => badge.id === "leadership" && badge.detected)) score += 6;
  return clamp(score);
}

function scorePaperwork(questionnaire: CandidateQuestionnaireIntelligence): number {
  if (!questionnaire.available) return NEUTRAL_SCORE;
  let score = NEUTRAL_SCORE;
  if (questionnaire.printerLaptopAccess === true) score += 15;
  if (questionnaire.photoUploadComfort === true) score += 8;
  if (questionnaire.printerLaptopAccess === false) score -= 12;
  return clamp(score);
}

function scoreRiskFlags(
  resume: CandidateResumeIntelligence,
  questionnaire: CandidateQuestionnaireIntelligence,
): number {
  let penalty = 0;
  if (questionnaire.techReady === false) penalty += 10;
  if (questionnaire.internetAccess === false) penalty += 6;
  if (questionnaire.smartphoneAccess === false) penalty += 6;
  if (resume.employmentGaps.length > 0) penalty += 4;
  return penalty;
}

function buildStrengths(
  resume: CandidateResumeIntelligence,
  questionnaire: CandidateQuestionnaireIntelligence,
): string[] {
  const strengths: string[] = [];
  for (const badge of resume.signalBadges.filter((entry) => entry.detected)) {
    strengths.push(badge.label);
  }
  if (questionnaire.smartphoneAccess && questionnaire.internetAccess) {
    strengths.push("Has smartphone and internet");
  }
  if (questionnaire.comfortableWithApps) strengths.push("Comfortable with apps");
  if (questionnaire.priorVendorExperience) strengths.push("Prior vendor/company experience reported");
  if (questionnaire.merchandisingExperience) strengths.push("Merchandising experience reported");
  return [...new Set(strengths)].slice(0, 6);
}

function buildConcerns(
  resume: CandidateResumeIntelligence,
  questionnaire: CandidateQuestionnaireIntelligence,
): string[] {
  const concerns: string[] = [];
  if (questionnaire.merchandisingExperience?.toLowerCase().includes("month") ||
      (questionnaire.merchandisingExperience && /\b(0|1)\b/.test(questionnaire.merchandisingExperience))) {
    concerns.push("Less than 1 year merchandising experience");
  }
  if (hasNoMerchandisingAnswer(questionnaire.merchandisingExperience)) {
    concerns.push("No merchandising experience reported");
  }
  if (questionnaire.printerLaptopAccess === false) concerns.push("No computer/printer access");
  if (questionnaire.internetAccess === false) concerns.push("No reliable internet access");
  if (questionnaire.smartphoneAccess === false) concerns.push("No smartphone access");
  if (questionnaire.comfortableWithApps === false) concerns.push("Not comfortable with apps/tools");
  if (resume.employmentGaps.length > 0) concerns.push("Employment gaps detected on resume");
  return concerns.slice(0, 5);
}

function buildRecommendedAction(input: {
  grade: CandidateReadinessGrade;
  concerns: string[];
  questionnaire: CandidateQuestionnaireIntelligence;
  resume: CandidateResumeIntelligence;
  candidate: BreezyCandidate;
}): string {
  const { grade, concerns, questionnaire, resume, candidate } = input;
  const phone = candidate.phone?.trim();
  const email = candidate.email?.trim();

  if (questionnaire.techReady === false) {
    if (phone) return `Call ${phone} to confirm smartphone, internet, and app access before advancing.`;
    if (email) return `Email ${email} to confirm tech setup (phone, internet, apps) before advancing.`;
    return "Contact candidate to confirm smartphone, internet, and app access.";
  }

  if (grade === "A") {
    if (phone) return `Call ${phone} to schedule an interview — strong retail and merchandising fit.`;
    if (email) return `Email ${email} to schedule an interview — strong retail and merchandising fit.`;
    return "Schedule interview — strong retail and merchandising fit.";
  }

  if (grade === "B") {
    if (phone) return `Call ${phone} to confirm availability, transportation, and start date.`;
    if (email) return `Email ${email} to confirm availability, transportation, and start date.`;
    return "Confirm availability, transportation, and start date before advancing.";
  }

  if (concerns.some((item) => item.includes("printer") || item.includes("internet") || item.includes("smartphone"))) {
    if (phone) return `Call ${phone} to confirm tech setup and paperwork readiness.`;
    return "Contact candidate to confirm tech setup and paperwork readiness.";
  }

  if (!resume.available && phone) {
    return `Call ${phone} to discuss experience and confirm merchandising background.`;
  }

  if (grade === "C") {
    if (phone) return `Call ${phone} for a 10-minute screening on retail experience and schedule fit.`;
    if (email) return `Email ${email} to schedule a brief screening on retail experience and schedule fit.`;
    return "Schedule a brief screening on retail experience and schedule fit.";
  }

  if (phone) return `Review concerns, then call ${phone} before advancing.`;
  if (email) return `Review concerns, then email ${email} before advancing.`;
  return "Review profile and decide whether to contact this candidate.";
}

export function buildCandidateReadinessScore(input: {
  candidate: BreezyCandidate;
  resume: CandidateResumeIntelligence;
  questionnaire: CandidateQuestionnaireIntelligence;
  resumeHaystack: string;
}): CandidateReadinessScore {
  const { candidate, resume, questionnaire, resumeHaystack } = input;

  const categoryScores: CandidateReadinessCategoryScores = {
    retailMerchandisingExperience: scoreRetailMerchandising(resume, questionnaire, resumeHaystack),
    reliabilityReadiness: scoreReliability(resume, questionnaire),
    technologyReadiness: scoreTechnology(questionnaire),
    communicationReadiness: scoreCommunication(resume, candidate),
    projectFit: scoreProjectFit(resume, resumeHaystack),
    paperworkReadiness: scorePaperwork(questionnaire),
    riskFlags: scoreRiskFlags(resume, questionnaire),
  };

  const weighted =
    categoryScores.retailMerchandisingExperience * 0.28 +
    categoryScores.reliabilityReadiness * 0.14 +
    categoryScores.technologyReadiness * 0.16 +
    categoryScores.communicationReadiness * 0.12 +
    categoryScores.projectFit * 0.15 +
    categoryScores.paperworkReadiness * 0.08 -
    categoryScores.riskFlags * 0.04;

  const overallScore = clamp(weighted);
  const grade = gradeFromScore(overallScore);
  const strengths = buildStrengths(resume, questionnaire);
  const concerns = buildConcerns(resume, questionnaire);
  const { confidence, confidenceLabel } = buildReadinessConfidence(resume, questionnaire);
  const gradeContributors = buildGradeContributors({ candidate, resume, questionnaire });

  return {
    overallScore,
    grade,
    categoryScores,
    strengths,
    concerns,
    recommendedNextAction: buildRecommendedAction({
      grade,
      concerns,
      questionnaire,
      resume,
      candidate,
    }),
    paperworkReady: categoryScores.paperworkReadiness >= 70,
    techReady: questionnaire.techReady,
    confidence,
    confidenceLabel,
    gradeContributors,
  };
}

export function baselineCandidateReadinessScore(): CandidateReadinessScore {
  return {
    overallScore: 0,
    grade: "D",
    categoryScores: {
      retailMerchandisingExperience: 0,
      reliabilityReadiness: 0,
      technologyReadiness: 0,
      communicationReadiness: 0,
      projectFit: 0,
      paperworkReadiness: 0,
      riskFlags: 0,
    },
    strengths: [],
    concerns: ["Enriching candidate intelligence…"],
    recommendedNextAction: "Open workspace after scores finish loading.",
    paperworkReady: false,
    techReady: null,
    confidence: "low",
    confidenceLabel: "Low confidence",
    gradeContributors: [],
  };
}
