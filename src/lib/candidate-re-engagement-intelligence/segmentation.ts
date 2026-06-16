import type { CandidateOpportunitySource, CandidateReEngagementSegment } from "@/lib/candidate-re-engagement-intelligence/types";

export function segmentReEngagementCandidate(input: {
  source: CandidateOpportunitySource;
  reEngagementScore: number;
  placementProbability: number;
  matchPercent: number;
}): CandidateReEngagementSegment {
  if (input.source === "past-worker") return "former-worker";
  if (input.matchPercent >= 80 || input.reEngagementScore >= 85) return "high-value";
  if (input.reEngagementScore >= 75) return "hot";
  if (input.reEngagementScore >= 55) return "warm";
  if (input.reEngagementScore >= 35) return "cold";
  return "dormant";
}

export function countBySegment(
  segments: CandidateReEngagementSegment[],
): Record<CandidateReEngagementSegment, number> {
  const counts: Record<CandidateReEngagementSegment, number> = {
    hot: 0,
    warm: 0,
    cold: 0,
    dormant: 0,
    "former-worker": 0,
    "high-value": 0,
  };
  for (const segment of segments) {
    counts[segment] += 1;
  }
  return counts;
}
