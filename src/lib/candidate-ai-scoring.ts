import type { BreezyCandidate } from "@/lib/breezy-api";
import type { CandidateWorkflowStatus } from "@/lib/candidate-workflow-types";
import {
  buildCandidateScoringInput,
  scoringHaystack,
  type CandidateScoringInput,
} from "@/lib/candidate-resume-prep";

export type AiLetterGrade = "A+" | "A" | "B" | "C" | "D";

export type AiScoreTier = "elite" | "strong" | "moderate" | "weak";

export type WorkflowRecommendation =
  | "Send paperwork"
  | "Needs recruiter review"
  | "Strong merchandising fit"
  | "High travel capability";

export type CandidateAiScoreBreakdown = {
  merchandisingKeywords: number;
  resetExperience: number;
  walmartTargetExperience: number;
  travelWillingness: number;
  yearsOfExperience: number;
  resumeSourceQuality: number;
  stageProgression: number;
  breezyScoreBoost: number;
};

export type CandidateAiScore = {
  letterGrade: AiLetterGrade;
  tier: AiScoreTier;
  tierLabel: string;
  numericScore: number;
  breakdown: CandidateAiScoreBreakdown;
  recommendations: WorkflowRecommendation[];
  summary: string;
};

const MERCHANDISING_KEYWORDS = [
  "merchandis",
  "planogram",
  "reset",
  "fixture",
  "osa",
  "stock",
  "shelf",
  "display",
  "category",
  "cpg",
  "brand ambassador",
];

const RESET_KEYWORDS = ["reset", "re-set", "store reset", "full reset", "partial reset"];

const WALMART_TARGET_KEYWORDS = ["walmart", "target", "sam's", "sams club", "costco"];

const TRAVEL_KEYWORDS = [
  "travel",
  "radius",
  "mile",
  "overnight",
  "territory",
  "multi-store",
  "route",
  "regional",
];

const MERCHANDISING_CAP = 20;
const RESET_CAP = 12;
const WALMART_TARGET_CAP = 15;
const TRAVEL_CAP = 15;
const YEARS_CAP = 15;
const RESUME_SOURCE_CAP = 13;
const STAGE_CAP = 10;
const BREEZY_BOOST_CAP = 10;

function scoreKeywordHits(text: string, keywords: string[], weight: number, cap: number): number {
  let hits = 0;
  for (const keyword of keywords) {
    if (text.includes(keyword)) hits += 1;
  }
  return Math.min(cap, hits * weight);
}

function scoreProfileCompleteness(candidate: BreezyCandidate): number {
  const fields = [
    candidate.firstName,
    candidate.lastName,
    candidate.email,
    candidate.phone,
    candidate.source,
    candidate.stage,
    candidate.positionName,
    candidate.city,
    candidate.state,
    candidate.appliedDate,
  ];
  const filled = fields.filter((value) => value.trim().length > 0).length;
  return Math.round((filled / fields.length) * 8);
}

function scoreSourceQuality(source: string): number {
  const normalized = source.toLowerCase();
  if (normalized.includes("referral") || normalized.includes("employee")) return 5;
  if (normalized.includes("indeed organic") || normalized.includes("organic indeed")) return 4;
  if (normalized.includes("directemployers") || normalized.includes("career page")) return 4;
  if (normalized.includes("indeed")) return 3;
  if (normalized.includes("monster")) return 3;
  if (normalized.includes("linkedin")) return 3;
  if (source.trim()) return 2;
  return 0;
}

function scoreResumeSourceQuality(candidate: BreezyCandidate): number {
  return Math.min(RESUME_SOURCE_CAP, scoreProfileCompleteness(candidate) + scoreSourceQuality(candidate.source));
}

function inferYearsOfExperience(text: string, breezyScore?: number): number {
  const yearMatch = text.match(/(\d{1,2})\+?\s*(years|yrs)/i);
  if (yearMatch) {
    const years = Number(yearMatch[1]);
    if (years >= 5) return YEARS_CAP;
    if (years >= 3) return 12;
    if (years >= 1) return 8;
  }
  if (text.includes("senior") || text.includes("lead")) return 10;
  if (breezyScore !== undefined && breezyScore >= 80) return 8;
  if (text.includes("entry") || text.includes("new")) return 3;
  return 5;
}

function scoreTravelWillingness(text: string, state: string): number {
  let score = scoreKeywordHits(text, TRAVEL_KEYWORDS, 3, 12);
  if (state.trim()) score += 3;
  return Math.min(TRAVEL_CAP, score);
}

function scoreStageProgression(stage: string): number {
  const normalized = stage.toLowerCase();
  if (
    normalized.includes("hired") ||
    normalized.includes("offer") ||
    normalized.includes("onboard") ||
    normalized.includes("active")
  ) {
    return STAGE_CAP;
  }
  if (
    normalized.includes("interview") ||
    normalized.includes("screen") ||
    normalized.includes("assessment") ||
    normalized.includes("qualified")
  ) {
    return 7;
  }
  if (normalized.includes("review") || normalized.includes("contacted")) return 5;
  if (normalized.includes("applied") || normalized.includes("new")) return 3;
  return 4;
}

export function numericScoreToTier(score: number): AiScoreTier {
  if (score >= 90) return "elite";
  if (score >= 75) return "strong";
  if (score >= 60) return "moderate";
  return "weak";
}

export function tierLabel(tier: AiScoreTier): string {
  switch (tier) {
    case "elite":
      return "Elite";
    case "strong":
      return "Strong";
    case "moderate":
      return "Moderate";
    case "weak":
      return "Weak";
  }
}

function numericToLetterGrade(score: number): AiLetterGrade {
  if (score >= 90) return "A+";
  if (score >= 80) return "A";
  if (score >= 70) return "B";
  if (score >= 60) return "C";
  return "D";
}

function buildRecommendations(
  breakdown: CandidateAiScoreBreakdown,
  workflowStatus: CandidateWorkflowStatus,
): WorkflowRecommendation[] {
  const recommendations: WorkflowRecommendation[] = [];
  if (breakdown.merchandisingKeywords >= 12 || breakdown.resetExperience >= 8) {
    recommendations.push("Strong merchandising fit");
  }
  if (breakdown.travelWillingness >= 10) {
    recommendations.push("High travel capability");
  }
  if (workflowStatus === "Qualified" || workflowStatus === "Paperwork Needed") {
    recommendations.push("Send paperwork");
  }
  if (
    workflowStatus === "Applied" ||
    workflowStatus === "Needs Review" ||
    breakdown.resumeSourceQuality < 8
  ) {
    recommendations.push("Needs recruiter review");
  }
  return [...new Set(recommendations)];
}

export function scoreCandidateInput(input: CandidateScoringInput): CandidateAiScore {
  const { candidate, workflowStatus = "Needs Review" } = input;
  const text = scoringHaystack(input);
  const breezyScoreBoost =
    candidate.score !== undefined ? Math.min(BREEZY_BOOST_CAP, Math.round(candidate.score / 10)) : 0;

  const breakdown: CandidateAiScoreBreakdown = {
    merchandisingKeywords: scoreKeywordHits(text, MERCHANDISING_KEYWORDS, 4, MERCHANDISING_CAP),
    resetExperience: scoreKeywordHits(text, RESET_KEYWORDS, 4, RESET_CAP),
    walmartTargetExperience: scoreKeywordHits(text, WALMART_TARGET_KEYWORDS, 5, WALMART_TARGET_CAP),
    travelWillingness: scoreTravelWillingness(text, candidate.state),
    yearsOfExperience: inferYearsOfExperience(text, candidate.score),
    resumeSourceQuality: scoreResumeSourceQuality(candidate),
    stageProgression: scoreStageProgression(candidate.stage),
    breezyScoreBoost,
  };

  const numericScore = Math.min(
    100,
    Math.max(
      1,
      Math.round(
        breakdown.merchandisingKeywords +
          breakdown.resetExperience +
          breakdown.walmartTargetExperience +
          breakdown.travelWillingness +
          breakdown.yearsOfExperience +
          breakdown.resumeSourceQuality +
          breakdown.stageProgression +
          breakdown.breezyScoreBoost,
      ),
    ),
  );

  const tier = numericScoreToTier(numericScore);
  const letterGrade = numericToLetterGrade(numericScore);
  const recommendations = buildRecommendations(breakdown, workflowStatus);
  const summary =
    recommendations.length > 0
      ? recommendations.join(" · ")
      : "Standard profile — review for fit";

  return {
    letterGrade,
    tier,
    tierLabel: tierLabel(tier),
    numericScore,
    breakdown,
    recommendations,
    summary,
  };
}

export function scoreCandidate(
  candidate: BreezyCandidate,
  workflowStatus: CandidateWorkflowStatus = "Needs Review",
  options?: { resumeText?: string },
): CandidateAiScore {
  return scoreCandidateInput(
    buildCandidateScoringInput(candidate, { resumeText: options?.resumeText, workflowStatus }),
  );
}

export const AI_SCORE_TIER_STYLES: Record<AiScoreTier, string> = {
  elite: "bg-emerald-500/20 text-emerald-100 ring-1 ring-emerald-400/40",
  strong: "bg-teal-500/20 text-teal-100 ring-1 ring-teal-400/40",
  moderate: "bg-amber-500/20 text-amber-200 ring-1 ring-amber-400/35",
  weak: "bg-red-500/20 text-red-200 ring-1 ring-red-400/35",
};

/** @deprecated Prefer AI_SCORE_TIER_STYLES for Command Center badges. */
export const AI_GRADE_STYLES: Record<AiLetterGrade, string> = {
  "A+": AI_SCORE_TIER_STYLES.elite,
  A: AI_SCORE_TIER_STYLES.strong,
  B: AI_SCORE_TIER_STYLES.moderate,
  C: AI_SCORE_TIER_STYLES.moderate,
  D: AI_SCORE_TIER_STYLES.weak,
};
