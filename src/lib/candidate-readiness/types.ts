export type CandidateReadinessGrade = "A" | "B" | "C" | "D";

export type CandidateQuestionnaireAnswer = {
  question: string;
  answer: string;
  normalizedKey?: string;
};

export type CandidateQuestionnaireIntelligence = {
  available: boolean;
  answers: CandidateQuestionnaireAnswer[];
  merchandisingExperience: string | null;
  priorVendorExperience: string | null;
  smartphoneAccess: boolean | null;
  internetAccess: boolean | null;
  comfortableWithApps: boolean | null;
  printerLaptopAccess: boolean | null;
  photoUploadComfort: boolean | null;
  scheduleUnderstanding: boolean | null;
  availabilityNotes: string | null;
  /** True/false when confirmed from answers; null when unknown or questionnaire missing. */
  techReady: boolean | null;
  missingAnswers: string[];
  readinessChecks: Array<{ label: string; passed: boolean | null }>;
};

export type ResumeSignalBadge = {
  id: string;
  label: string;
  detected: boolean;
};

export type CandidateResumeIntelligence = {
  available: boolean;
  summary: string | null;
  workHistoryHighlights: string[];
  relevantSkills: string[];
  signalBadges: ResumeSignalBadge[];
  phoneCustomerServiceExperience: boolean | null;
  merchandisingRetailExperience: boolean | null;
  employmentGaps: string[];
  experienceFlags: string[];
};

export type CandidateReadinessCategoryScores = {
  retailMerchandisingExperience: number;
  reliabilityReadiness: number;
  technologyReadiness: number;
  communicationReadiness: number;
  projectFit: number;
  paperworkReadiness: number;
  riskFlags: number;
};

export type CandidateReadinessScore = {
  overallScore: number;
  grade: CandidateReadinessGrade;
  categoryScores: CandidateReadinessCategoryScores;
  strengths: string[];
  concerns: string[];
  recommendedNextAction: string;
  paperworkReady: boolean;
  techReady: boolean | null;
};

export type CandidateIntelligenceBundle = {
  resume: CandidateResumeIntelligence;
  questionnaire: CandidateQuestionnaireIntelligence;
  grade: CandidateReadinessScore;
};

export type CandidateIntelligenceFilterId =
  | "grade-a"
  | "grade-b"
  | "tech-ready"
  | "needs-phone-confirmation"
  | "retail-experience"
  | "no-merchandising"
  | "missing-questionnaire"
  | "missing-resume";

export const CANDIDATE_INTELLIGENCE_FILTERS: Array<{ id: CandidateIntelligenceFilterId; label: string }> = [
  { id: "grade-a", label: "Grade A" },
  { id: "grade-b", label: "Grade B" },
  { id: "tech-ready", label: "Tech ready" },
  { id: "needs-phone-confirmation", label: "Needs phone confirmation" },
  { id: "retail-experience", label: "Retail experience" },
  { id: "no-merchandising", label: "No merchandising experience" },
  { id: "missing-questionnaire", label: "Missing questionnaire" },
  { id: "missing-resume", label: "Missing resume" },
];
