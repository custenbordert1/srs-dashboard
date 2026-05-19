import type { BreezyCandidate } from "@/lib/breezy-api";
import type { CandidateWorkflowStatus } from "@/lib/candidate-workflow-types";

export type AiLetterGrade = "A+" | "A" | "B" | "C" | "D";

export type WorkflowRecommendation =
  | "Send paperwork"
  | "Needs recruiter review"
  | "Strong merchandising fit"
  | "High travel capability";

export type CandidateAiScoreBreakdown = {
  merchandisingKeywords: number;
  resetExperience: number;
  walmartTargetExperience: number;
  travelRadius: number;
  resumeCompleteness: number;
  yearsOfExperience: number;
  retailTerminology: number;
  breezyScoreBoost: number;
};

export type CandidateAiScore = {
  letterGrade: AiLetterGrade;
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

const RETAIL_TERMS = [
  "retail",
  "grocery",
  "big box",
  "in-store",
  "field",
  "representative",
  "merchandiser",
  "vendor",
  "plan-o-gram",
];

function haystack(candidate: BreezyCandidate): string {
  return [
    candidate.firstName,
    candidate.lastName,
    candidate.email,
    candidate.phone,
    candidate.source,
    candidate.stage,
    candidate.positionName,
    candidate.city,
    candidate.state,
  ]
    .join(" ")
    .toLowerCase();
}

function scoreKeywordHits(text: string, keywords: string[], weight: number, cap: number): number {
  let hits = 0;
  for (const keyword of keywords) {
    if (text.includes(keyword)) hits += 1;
  }
  return Math.min(cap, hits * weight);
}

function scoreCompleteness(candidate: BreezyCandidate): number {
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
  return Math.round((filled / fields.length) * 20);
}

function inferYearsOfExperience(text: string, breezyScore?: number): number {
  const yearMatch = text.match(/(\d{1,2})\+?\s*(years|yrs)/i);
  if (yearMatch) {
    const years = Number(yearMatch[1]);
    if (years >= 5) return 18;
    if (years >= 3) return 14;
    if (years >= 1) return 10;
  }
  if (text.includes("senior") || text.includes("lead")) return 12;
  if (breezyScore !== undefined && breezyScore >= 80) return 10;
  if (text.includes("entry") || text.includes("new")) return 4;
  return 6;
}

function scoreTravelRadius(text: string, state: string): number {
  let score = scoreKeywordHits(text, TRAVEL_KEYWORDS, 4, 16);
  if (state.trim()) score += 4;
  if (text.includes("remote") || text.includes("hybrid")) score += 2;
  return Math.min(20, score);
}

function numericToGrade(score: number): AiLetterGrade {
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
  if (breakdown.travelRadius >= 12) {
    recommendations.push("High travel capability");
  }
  if (workflowStatus === "Qualified" || workflowStatus === "Paperwork Needed") {
    recommendations.push("Send paperwork");
  }
  if (
    workflowStatus === "Applied" ||
    workflowStatus === "Needs Review" ||
    breakdown.resumeCompleteness < 12
  ) {
    recommendations.push("Needs recruiter review");
  }
  return [...new Set(recommendations)];
}

export function scoreCandidate(
  candidate: BreezyCandidate,
  workflowStatus: CandidateWorkflowStatus = "Needs Review",
): CandidateAiScore {
  const text = haystack(candidate);
  const breezyScoreBoost = candidate.score !== undefined ? Math.min(10, Math.round(candidate.score / 10)) : 0;

  const breakdown: CandidateAiScoreBreakdown = {
    merchandisingKeywords: scoreKeywordHits(text, MERCHANDISING_KEYWORDS, 3, 18),
    resetExperience: scoreKeywordHits(text, RESET_KEYWORDS, 4, 12),
    walmartTargetExperience: scoreKeywordHits(text, WALMART_TARGET_KEYWORDS, 5, 15),
    travelRadius: scoreTravelRadius(text, candidate.state),
    resumeCompleteness: scoreCompleteness(candidate),
    yearsOfExperience: inferYearsOfExperience(text, candidate.score),
    retailTerminology: scoreKeywordHits(text, RETAIL_TERMS, 2, 10),
    breezyScoreBoost,
  };

  const numericScore = Math.min(
    100,
    Math.round(
      breakdown.merchandisingKeywords +
        breakdown.resetExperience +
        breakdown.walmartTargetExperience +
        breakdown.travelRadius +
        breakdown.resumeCompleteness +
        breakdown.yearsOfExperience +
        breakdown.retailTerminology +
        breakdown.breezyScoreBoost,
    ),
  );

  const letterGrade = numericToGrade(numericScore);
  const recommendations = buildRecommendations(breakdown, workflowStatus);
  const summary =
    recommendations.length > 0
      ? recommendations.join(" · ")
      : "Standard profile — review for fit";

  return {
    letterGrade,
    numericScore,
    breakdown,
    recommendations,
    summary,
  };
}

export const AI_GRADE_STYLES: Record<AiLetterGrade, string> = {
  "A+": "bg-emerald-500/20 text-emerald-100 ring-1 ring-emerald-400/40",
  A: "bg-teal-500/20 text-teal-100 ring-1 ring-teal-400/40",
  B: "bg-sky-500/20 text-sky-200 ring-1 ring-sky-400/35",
  C: "bg-amber-500/20 text-amber-200 ring-1 ring-amber-400/35",
  D: "bg-red-500/20 text-red-200 ring-1 ring-red-400/35",
};
