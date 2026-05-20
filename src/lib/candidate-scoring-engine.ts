import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import {
  buildCandidateScoringInput,
  scoringHaystack,
  type CandidateScoringInput,
} from "@/lib/candidate-resume-prep";
import { getDmForState, normalizeStateCode } from "@/lib/dm-territory-map";
import {
  cityKey,
  isInterviewingStage,
  isHiredStage,
  parseDate,
} from "@/lib/dm-dashboard/territory-shared";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type CandidateScoreFactors = {
  resumeKeywords: number;
  merchandisingExperience: number;
  retailExperience: number;
  travelRadius: number;
  territoryFit: number;
  communicationResponsiveness: number;
  interviewLikelihood: number;
};

export type CandidateScoreResult = {
  score: number;
  factors: CandidateScoreFactors;
  extractedKeywords: string[];
  tier: "elite" | "strong" | "moderate" | "weak";
  tierLabel: string;
};

const RESUME_KEYWORD_GROUPS: { label: string; terms: string[]; weight: number }[] = [
  { label: "Walmart", terms: ["walmart", "wal-mart"], weight: 4 },
  { label: "Target", terms: ["target stores", "target corp"], weight: 4 },
  { label: "Reset", terms: ["reset", "re-set", "store reset"], weight: 5 },
  { label: "Grocery merchandising", terms: ["grocery", "supermarket", "kroger", "publix", "albertsons"], weight: 4 },
  { label: "OOS scanning", terms: ["oos", "out of stock", "scanning", "on-shelf"], weight: 4 },
  { label: "Fixture / planogram", terms: ["fixture", "planogram", "pog", "shelf set"], weight: 5 },
  { label: "Merchandising", terms: ["merchandis", "category", "cpg", "brand ambassador", "display"], weight: 3 },
  { label: "Retail", terms: ["retail", "big box", "store associate", "sales floor"], weight: 2 },
];

const TRAVEL_TERMS = ["travel", "radius", "mile", "overnight", "multi-store", "route", "regional", "territory"];

function clampScore(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function extractResumeKeywords(text: string): string[] {
  const found: string[] = [];
  for (const group of RESUME_KEYWORD_GROUPS) {
    if (group.terms.some((term) => text.includes(term))) found.push(group.label);
  }
  for (const term of TRAVEL_TERMS) {
    if (text.includes(term) && !found.includes("Travel willing")) found.push("Travel willing");
  }
  return found;
}

function scoreResumeKeywords(text: string): { score: number; keywords: string[] } {
  const keywords = extractResumeKeywords(text);
  let score = 0;
  for (const group of RESUME_KEYWORD_GROUPS) {
    if (keywords.includes(group.label)) score += group.weight;
  }
  if (keywords.includes("Travel willing")) score += 4;
  return { score: Math.min(22, score), keywords };
}

function scoreMerchandising(text: string): number {
  const merchTerms = ["merchandis", "planogram", "reset", "fixture", "osa", "shelf", "display", "cpg"];
  let hits = 0;
  for (const term of merchTerms) {
    if (text.includes(term)) hits += 1;
  }
  return Math.min(18, hits * 3);
}

function scoreRetail(text: string): number {
  const retailTerms = ["retail", "walmart", "target", "costco", "sam's", "grocery", "store"];
  let hits = 0;
  for (const term of retailTerms) {
    if (text.includes(term)) hits += 1;
  }
  return Math.min(15, hits * 2.5);
}

function scoreTravelRadius(text: string, state: string): number {
  let score = 0;
  for (const term of TRAVEL_TERMS) {
    if (text.includes(term)) score += 3;
  }
  if (state.trim()) score += 4;
  return Math.min(14, score);
}

function scoreTerritoryFit(candidate: BreezyCandidate, territoryStates?: string[]): number {
  const state = normalizeStateCode(candidate.state);
  if (!state) return 4;
  if (!territoryStates || territoryStates.length === 0) return 12;
  return territoryStates.includes(state) ? 14 : 3;
}

function scoreCommunicationResponsiveness(candidate: BreezyCandidate, reference: Date): number {
  const applied = parseDate(candidate.appliedDate);
  if (!applied) return 4;
  const days = Math.max(0, Math.round((reference.getTime() - applied.getTime()) / MS_PER_DAY));
  if (days <= 1) return 14;
  if (days <= 3) return 12;
  if (days <= 7) return 9;
  if (days <= 14) return 6;
  return 3;
}

function scoreInterviewLikelihood(candidate: BreezyCandidate): number {
  const stage = candidate.stage.toLowerCase();
  if (isHiredStage(stage)) return 16;
  if (isInterviewingStage(stage)) return 14;
  if (stage.includes("qualified") || stage.includes("screen")) return 10;
  if (stage.includes("review") || stage.includes("contacted")) return 7;
  if (stage.includes("applied") || stage.includes("new")) return 4;
  if (candidate.score !== undefined && candidate.score >= 70) return 8;
  return 5;
}

function scoreToTier(score: number): CandidateScoreResult["tier"] {
  if (score >= 85) return "elite";
  if (score >= 70) return "strong";
  if (score >= 55) return "moderate";
  return "weak";
}

export function tierLabelForScore(tier: CandidateScoreResult["tier"]): string {
  switch (tier) {
    case "elite":
      return "Elite fit";
    case "strong":
      return "Strong fit";
    case "moderate":
      return "Moderate fit";
    case "weak":
      return "Developing fit";
  }
}

export type CandidateScoringContext = {
  referenceIso?: string;
  territoryStates?: string[];
  job?: Pick<BreezyJob, "city" | "state">;
};

export function scoreCandidateComprehensive(
  input: CandidateScoringInput,
  context: CandidateScoringContext = {},
): CandidateScoreResult {
  const { candidate } = input;
  const text = scoringHaystack(input);
  const reference = new Date(context.referenceIso ?? new Date().toISOString());

  const keywordResult = scoreResumeKeywords(text);
  const merchandisingExperience = scoreMerchandising(text);
  const retailExperience = scoreRetail(text);
  const travelRadius = scoreTravelRadius(text, candidate.state);
  let territoryFit = scoreTerritoryFit(candidate, context.territoryStates);
  const communicationResponsiveness = scoreCommunicationResponsiveness(candidate, reference);
  const interviewLikelihood = scoreInterviewLikelihood(candidate);

  if (context.job) {
    const sameCity = cityKey(candidate.city, candidate.state) === cityKey(context.job.city, context.job.state);
    const sameState =
      normalizeStateCode(candidate.state) === normalizeStateCode(context.job.state) && candidate.state.trim();
    if (sameCity) territoryFit = Math.min(18, territoryFit + 6);
    else if (sameState) territoryFit = Math.min(16, territoryFit + 4);
  }

  const breezyBoost =
    candidate.score !== undefined ? Math.min(8, Math.round(candidate.score / 12)) : 0;

  const factors: CandidateScoreFactors = {
    resumeKeywords: keywordResult.score,
    merchandisingExperience,
    retailExperience,
    travelRadius,
    territoryFit,
    communicationResponsiveness,
    interviewLikelihood,
  };

  const raw =
    factors.resumeKeywords +
    factors.merchandisingExperience +
    factors.retailExperience +
    factors.travelRadius +
    factors.territoryFit +
    factors.communicationResponsiveness +
    factors.interviewLikelihood +
    breezyBoost;

  const score = clampScore(raw);
  const tier = scoreToTier(score);

  return {
    score,
    factors,
    extractedKeywords: keywordResult.keywords,
    tier,
    tierLabel: tierLabelForScore(tier),
  };
}

export function scoreBreezyCandidate(
  candidate: BreezyCandidate,
  context?: CandidateScoringContext,
): CandidateScoreResult {
  return scoreCandidateComprehensive(buildCandidateScoringInput(candidate), context);
}

export function getDmTerritoryForCandidate(candidate: BreezyCandidate): string | undefined {
  return getDmForState(candidate.state);
}
