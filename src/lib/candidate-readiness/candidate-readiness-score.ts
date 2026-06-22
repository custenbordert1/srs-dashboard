import type { BreezyCandidate } from "@/lib/breezy-api";
import type {
  CandidateQuestionnaireIntelligence,
  CandidateReadinessCategoryScores,
  CandidateReadinessGrade,
  CandidateReadinessScore,
  CandidateResumeIntelligence,
} from "@/lib/candidate-readiness/types";

function clamp(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function gradeFromScore(score: number): CandidateReadinessGrade {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  return "D";
}

function scoreRetailMerchandising(
  resume: CandidateResumeIntelligence,
  questionnaire: CandidateQuestionnaireIntelligence,
  haystack: string,
): number {
  let score = 40;
  if (resume.merchandisingRetailExperience) score += 25;
  if (questionnaire.merchandisingExperience) {
    const answer = questionnaire.merchandisingExperience.toLowerCase();
    if (/\b(3|4|5|6|7|8|9|10|\d{2,})\b/.test(answer) || answer.includes("year")) score += 20;
    else if (answer.includes("month") || answer.includes("1")) score += 8;
    else score += 12;
  }
  if (haystack.includes("reset") || haystack.includes("planogram")) score += 10;
  if (haystack.includes("walmart") || haystack.includes("target")) score += 8;
  return clamp(score);
}

function scoreReliability(
  resume: CandidateResumeIntelligence,
  questionnaire: CandidateQuestionnaireIntelligence,
): number {
  let score = 55;
  if (questionnaire.scheduleUnderstanding === true) score += 15;
  if (questionnaire.availabilityNotes?.trim()) score += 10;
  if (resume.employmentGaps.length === 0 && resume.available) score += 10;
  if (resume.employmentGaps.length > 0) score -= resume.employmentGaps.length * 8;
  return clamp(score);
}

function scoreTechnology(questionnaire: CandidateQuestionnaireIntelligence): number {
  if (!questionnaire.available) return 35;
  let score = 30;
  if (questionnaire.smartphoneAccess === true) score += 18;
  if (questionnaire.internetAccess === true) score += 18;
  if (questionnaire.comfortableWithApps === true) score += 18;
  if (questionnaire.printerLaptopAccess === true) score += 8;
  if (questionnaire.photoUploadComfort === true) score += 8;
  if (questionnaire.smartphoneAccess === false) score -= 15;
  if (questionnaire.internetAccess === false) score -= 15;
  if (questionnaire.comfortableWithApps === false) score -= 10;
  return clamp(score);
}

function scoreCommunication(resume: CandidateResumeIntelligence, candidate: BreezyCandidate): number {
  let score = 50;
  if (candidate.phone?.trim()) score += 15;
  if (candidate.email?.trim()) score += 10;
  if (resume.phoneCustomerServiceExperience) score += 20;
  if (resume.summary && resume.summary.length > 40) score += 10;
  return clamp(score);
}

function scoreProjectFit(resume: CandidateResumeIntelligence, haystack: string): number {
  let score = 45;
  if (resume.relevantSkills.length >= 3) score += 20;
  else if (resume.relevantSkills.length >= 1) score += 10;
  if (haystack.includes("travel") || haystack.includes("mile")) score += 10;
  if (resume.workHistoryHighlights.length >= 2) score += 10;
  return clamp(score);
}

function scorePaperwork(questionnaire: CandidateQuestionnaireIntelligence): number {
  let score = 60;
  if (questionnaire.printerLaptopAccess === true) score += 20;
  if (questionnaire.photoUploadComfort === true) score += 10;
  if (questionnaire.printerLaptopAccess === false) score -= 20;
  return clamp(score);
}

function scoreRiskFlags(
  resume: CandidateResumeIntelligence,
  questionnaire: CandidateQuestionnaireIntelligence,
): number {
  let penalty = 0;
  if (!resume.available) penalty += 8;
  if (!questionnaire.available) penalty += 8;
  if (questionnaire.techReady === false) penalty += 12;
  if (resume.employmentGaps.length > 0) penalty += 6;
  if (!questionnaire.merchandisingExperience && resume.merchandisingRetailExperience !== true) penalty += 6;
  return penalty;
}

function buildStrengths(
  resume: CandidateResumeIntelligence,
  questionnaire: CandidateQuestionnaireIntelligence,
  categories: CandidateReadinessCategoryScores,
): string[] {
  const strengths: string[] = [];
  if (questionnaire.smartphoneAccess && questionnaire.internetAccess) {
    strengths.push("Has smartphone and internet");
  }
  if (questionnaire.comfortableWithApps) strengths.push("Comfortable with apps");
  if (resume.phoneCustomerServiceExperience) strengths.push("Customer service experience");
  if (resume.merchandisingRetailExperience) strengths.push("Merchandising/retail experience on resume");
  if (questionnaire.priorVendorExperience) strengths.push("Prior vendor/company experience reported");
  if (categories.projectFit >= 70) strengths.push("Strong project fit signals");
  if (categories.paperworkReadiness >= 75) strengths.push("Paperwork readiness indicators present");
  return strengths.slice(0, 5);
}

function buildConcerns(
  resume: CandidateResumeIntelligence,
  questionnaire: CandidateQuestionnaireIntelligence,
  categories: CandidateReadinessCategoryScores,
): string[] {
  const concerns: string[] = [];
  if (!resume.available) concerns.push("Resume not available from Breezy yet");
  if (!questionnaire.available) concerns.push("Questionnaire not available from Breezy yet");
  if (questionnaire.merchandisingExperience?.toLowerCase().includes("month") ||
      (questionnaire.merchandisingExperience && /\b(0|1)\b/.test(questionnaire.merchandisingExperience))) {
    concerns.push("Less than 1 year merchandising experience");
  }
  if (questionnaire.printerLaptopAccess === false) concerns.push("No computer/printer access");
  if (questionnaire.internetAccess === false) concerns.push("No reliable internet access");
  if (questionnaire.smartphoneAccess === false) concerns.push("No smartphone access");
  if (resume.employmentGaps.length > 0) concerns.push("Employment gaps detected on resume");
  if (categories.technologyReadiness < 55) concerns.push("Technology readiness needs confirmation");
  return concerns.slice(0, 5);
}

function buildRecommendedAction(
  grade: CandidateReadinessGrade,
  concerns: string[],
  questionnaire: CandidateQuestionnaireIntelligence,
): string {
  if (!questionnaire.available) {
    return "Review Breezy profile for questionnaire answers before outreach.";
  }
  if (grade === "A") {
    return "Proceed with recruiter review. Prioritize for interview scheduling.";
  }
  if (grade === "B") {
    return "Proceed with recruiter review. Confirm availability and transportation.";
  }
  if (concerns.some((c) => c.includes("Technology"))) {
    return "Confirm tech readiness (phone, internet, apps) before advancing.";
  }
  if (grade === "C") {
    return "Schedule screening call to validate experience and tech setup.";
  }
  return "Hold for manual review — significant gaps in resume or questionnaire.";
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
    categoryScores.retailMerchandisingExperience * 0.25 +
    categoryScores.reliabilityReadiness * 0.15 +
    categoryScores.technologyReadiness * 0.2 +
    categoryScores.communicationReadiness * 0.1 +
    categoryScores.projectFit * 0.15 +
    categoryScores.paperworkReadiness * 0.1 -
    categoryScores.riskFlags * 0.05;

  const overallScore = clamp(weighted);
  const grade = gradeFromScore(overallScore);
  const strengths = buildStrengths(resume, questionnaire, categoryScores);
  const concerns = buildConcerns(resume, questionnaire, categoryScores);

  return {
    overallScore,
    grade,
    categoryScores,
    strengths,
    concerns,
    recommendedNextAction: buildRecommendedAction(grade, concerns, questionnaire),
    paperworkReady: categoryScores.paperworkReadiness >= 70,
    techReady: questionnaire.techReady,
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
    techReady: false,
  };
}
