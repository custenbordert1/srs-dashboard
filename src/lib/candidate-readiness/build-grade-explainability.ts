import type { BreezyCandidate } from "@/lib/breezy-api";
import type {
  CandidateQuestionnaireIntelligence,
  CandidateReadinessConfidence,
  CandidateResumeIntelligence,
  GradeContributor,
} from "@/lib/candidate-readiness/types";

export function hasNoMerchandisingAnswer(answer: string | null | undefined): boolean {
  if (!answer?.trim()) return false;
  const value = answer.trim().toLowerCase();
  return value === "no" || value === "none" || value.includes("no experience") || value.includes("none reported");
}

export function buildReadinessConfidence(
  resume: CandidateResumeIntelligence,
  questionnaire: CandidateQuestionnaireIntelligence,
): { confidence: CandidateReadinessConfidence; confidenceLabel: string } {
  if (resume.available && questionnaire.available) {
    return { confidence: "high", confidenceLabel: "High confidence" };
  }
  if (resume.available || questionnaire.available) {
    return { confidence: "medium", confidenceLabel: "Medium confidence" };
  }
  return { confidence: "low", confidenceLabel: "Low confidence" };
}

export function buildGradeContributors(input: {
  candidate: BreezyCandidate;
  resume: CandidateResumeIntelligence;
  questionnaire: CandidateQuestionnaireIntelligence;
}): GradeContributor[] {
  const { candidate, resume, questionnaire } = input;
  const positive: GradeContributor[] = [];
  const negative: GradeContributor[] = [];

  const badge = (id: string) => resume.signalBadges.find((entry) => entry.id === id)?.detected ?? false;

  if (badge("retail")) positive.push({ kind: "positive", label: "Retail experience" });
  if (badge("customer_service") || resume.phoneCustomerServiceExperience) {
    positive.push({ kind: "positive", label: "Customer service experience" });
  }
  if (badge("merchandising") || resume.merchandisingRetailExperience) {
    positive.push({ kind: "positive", label: "Merchandising experience" });
  }
  if (questionnaire.merchandisingExperience?.trim()) {
    positive.push({ kind: "positive", label: "Merchandising experience reported" });
  }
  if (questionnaire.smartphoneAccess === true) positive.push({ kind: "positive", label: "Smartphone confirmed" });
  if (questionnaire.internetAccess === true) positive.push({ kind: "positive", label: "Internet confirmed" });
  if (questionnaire.comfortableWithApps === true) positive.push({ kind: "positive", label: "Comfort with apps confirmed" });
  if (badge("travel")) positive.push({ kind: "positive", label: "Travel willingness" });
  if (questionnaire.priorVendorExperience?.trim()) {
    positive.push({ kind: "positive", label: "Prior vendor/company experience" });
  }
  if (questionnaire.availabilityNotes?.trim()) positive.push({ kind: "positive", label: "Availability provided" });
  if (candidate.phone?.trim()) positive.push({ kind: "positive", label: "Phone number on file" });
  if (badge("leadership")) positive.push({ kind: "positive", label: "Leadership experience" });
  if (badge("cash_handling")) positive.push({ kind: "positive", label: "Cash handling experience" });

  const hasMerchSignal =
    badge("merchandising") ||
    resume.merchandisingRetailExperience ||
    Boolean(questionnaire.merchandisingExperience?.trim());

  if (hasNoMerchandisingAnswer(questionnaire.merchandisingExperience)) {
    negative.push({ kind: "negative", label: "No merchandising experience reported" });
  } else if (resume.available && !hasMerchSignal) {
    negative.push({ kind: "negative", label: "No merchandising experience found" });
  }

  const travelConfirmed = badge("travel") || Boolean(questionnaire.availabilityNotes?.trim());
  if ((resume.available || questionnaire.available) && !travelConfirmed) {
    negative.push({ kind: "negative", label: "Transportation not confirmed" });
  }

  if (questionnaire.smartphoneAccess === false) negative.push({ kind: "negative", label: "No smartphone access" });
  if (questionnaire.internetAccess === false) negative.push({ kind: "negative", label: "No internet access" });
  if (questionnaire.printerLaptopAccess === false) negative.push({ kind: "negative", label: "No computer/printer access" });
  if (questionnaire.comfortableWithApps === false) negative.push({ kind: "negative", label: "Not comfortable with apps" });

  if (questionnaire.merchandisingExperience?.toLowerCase().includes("month") ||
      (questionnaire.merchandisingExperience && /\b(0|1)\b/.test(questionnaire.merchandisingExperience))) {
    negative.push({ kind: "negative", label: "Less than 1 year merchandising experience" });
  }

  if (resume.employmentGaps.length > 0) {
    negative.push({ kind: "negative", label: "Employment gaps detected" });
  }

  if (!candidate.phone?.trim() && (resume.available || questionnaire.available)) {
    negative.push({ kind: "negative", label: "Phone number missing" });
  }

  const dedupedPositive = dedupeContributors(positive).slice(0, 4);
  const dedupedNegative = dedupeContributors(negative).slice(0, 4);

  return [...dedupedPositive, ...dedupedNegative];
}

function dedupeContributors(items: GradeContributor[]): GradeContributor[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.kind}:${item.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
