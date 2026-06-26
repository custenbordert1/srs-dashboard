import {
  buildMarketIntelligenceSnapshot,
  describeCoverageImpact,
  scoreCandidateMarketFit,
} from "@/lib/workforce-placement-intelligence/build-market-intelligence";
import type {
  MarketIntelligenceRow,
  MarketRecommendationReason,
  PlacementCandidateInput,
  PlacementEligibilityResult,
  WorkforceMarketRecommendation,
} from "@/lib/workforce-placement-intelligence/types";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import type { ActiveRep } from "@/lib/rep-intelligence/rep-types";
import { normalizeStateCode } from "@/lib/dm-territory-map";

function candidateName(row: PlacementCandidateInput): string {
  return `${row.firstName} ${row.lastName}`.trim() || row.email || "Candidate";
}

function confidenceLabel(score: number): WorkforceMarketRecommendation["confidenceLabel"] {
  if (score >= 85) return "high";
  if (score >= 65) return "medium";
  return "low";
}

function buildReasoning(input: {
  market: MarketIntelligenceRow;
  row: PlacementCandidateInput;
  compositeScore: number;
}): MarketRecommendationReason[] {
  const reasons: MarketRecommendationReason[] = [];

  if (input.market.demandScore >= 70) {
    reasons.push({ id: "demand", label: "Highest demand score in candidate fit set", positive: true });
  } else if (input.market.demandScore >= 50) {
    reasons.push({ id: "demand", label: "Strong market demand score", positive: true });
  }

  const sameState =
    normalizeStateCode(input.row.state ?? "") === normalizeStateCode(input.market.state);
  const sameCity =
    input.row.city?.trim().toLowerCase() === input.market.city.trim().toLowerCase();

  if (sameCity) {
    reasons.push({ id: "proximity", label: "Candidate lives in this market", positive: true });
  } else if (sameState) {
    reasons.push({ id: "proximity", label: "Candidate lives nearby (same state)", positive: true });
  }

  if (input.row.questionnaireIntelligence.smartphoneAccess === true) {
    reasons.push({ id: "smartphone", label: "Smartphone confirmed", positive: true });
  }

  if (!reasons.some((row) => row.id === "transportation")) {
    const travelReady =
      input.row.skillTags.includes("travel_willing") || (input.row.travelFitScore ?? 0) >= 50;
    if (travelReady) {
      reasons.push({ id: "transportation", label: "Transportation confirmed", positive: true });
    }
  }

  if (
    input.row.resumeIntelligence.merchandisingRetailExperience ||
    input.row.skillTags.includes("retail_merchandising")
  ) {
    reasons.push({ id: "experience", label: "Retail experience detected", positive: true });
  }

  if (input.market.staffingShortage) {
    reasons.push({ id: "shortage", label: "Staffing shortage", positive: true });
  }

  if (input.market.priorityOverride) {
    reasons.push({
      id: "priority",
      label: "Priority coverage area",
      positive: true,
    });
  }

  if (reasons.length === 0) {
    reasons.push({
      id: "fallback",
      label: `Best available market fit (score ${input.compositeScore})`,
      positive: true,
    });
  }

  return reasons;
}

export function buildWorkforceMarketRecommendation(input: {
  row: PlacementCandidateInput;
  eligibility: PlacementEligibilityResult;
  markets: MarketIntelligenceRow[];
  marketCandidateCounts: Map<string, number>;
}): WorkforceMarketRecommendation | null {
  if (input.eligibility.status !== "eligible") return null;
  if (input.markets.length === 0) return null;

  const scored = input.markets
    .map((market) => {
      const compositeScore = scoreCandidateMarketFit({
        candidateCity: input.row.city ?? "",
        candidateState: input.row.state ?? "",
        market,
      });
      return { market, compositeScore };
    })
    .sort((a, b) => b.compositeScore - a.compositeScore);

  const best = scored[0];
  if (!best) return null;

  const marketCount = (input.marketCandidateCounts.get(best.market.marketKey) ?? 0) + 1;
  input.marketCandidateCounts.set(best.market.marketKey, marketCount);

  const confidenceScore = clampConfidence(best.compositeScore);
  const reasoning = buildReasoning({
    market: best.market,
    row: input.row,
    compositeScore: best.compositeScore,
  });

  return {
    candidateId: input.row.candidateId,
    candidateName: candidateName(input.row),
    candidateCity: input.row.city ?? "",
    candidateState: input.row.state ?? "",
    recommendedMarketKey: best.market.marketKey,
    recommendedMarketLabel: best.market.marketLabel,
    demandScore: best.market.demandScore,
    confidenceScore,
    confidenceLabel: confidenceLabel(confidenceScore),
    reasoning,
    coverageImpact: describeCoverageImpact(best.market, marketCount),
    previewOnly: true,
  };
}

function clampConfidence(score: number): number {
  return Math.min(99, Math.max(40, Math.round(score)));
}

export function buildWorkforceMarketRecommendations(input: {
  candidates: Array<{
    row: PlacementCandidateInput;
    eligibility: PlacementEligibilityResult;
  }>;
  opportunities: MelOpportunity[];
  activeReps: ActiveRep[];
}): {
  recommendations: WorkforceMarketRecommendation[];
  markets: MarketIntelligenceRow[];
} {
  const { markets } = buildMarketIntelligenceSnapshot({
    opportunities: input.opportunities,
    activeReps: input.activeReps,
  });

  const marketCandidateCounts = new Map<string, number>();
  const recommendations: WorkforceMarketRecommendation[] = [];

  for (const candidate of input.candidates) {
    const recommendation = buildWorkforceMarketRecommendation({
      row: candidate.row,
      eligibility: candidate.eligibility,
      markets,
      marketCandidateCounts,
    });
    if (recommendation) recommendations.push(recommendation);
  }

  recommendations.sort(
    (a, b) =>
      b.confidenceScore - a.confidenceScore ||
      b.demandScore - a.demandScore ||
      a.candidateName.localeCompare(b.candidateName),
  );

  return { recommendations, markets };
}
