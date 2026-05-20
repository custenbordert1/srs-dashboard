import type { BreezyCandidate } from "@/lib/breezy-api";
import { distanceBetweenLocations, DEFAULT_TRAVEL_RADIUS_MILES } from "@/lib/mel-matching/distance-utils";
import type {
  CandidateMatchResult,
  CandidateOpportunityMatch,
  MelOpportunity,
} from "@/lib/mel-matching/matching-engine-types";
import { scoreOpportunityFit } from "@/lib/mel-matching/opportunity-fit-scoring";

export type MatchCandidateOptions = {
  territoryStates?: string[];
  travelRadiusMiles?: number;
  limit?: number;
  openOnly?: boolean;
};

const DEFAULT_LIMIT = 8;

function aggregateAiSummary(matches: CandidateOpportunityMatch[]): string {
  if (matches.length === 0) {
    return "No open MEL opportunities within travel radius — consider expanding recruiting radius or nearby markets.";
  }
  const strong = matches.filter((m) => m.matchLabel === "Strong Match");
  if (strong.length > 0) return strong[0]!.summary;
  const good = matches.filter((m) => m.matchLabel === "Good Match");
  if (good.length > 0) return good[0]!.summary;
  return matches[0]!.summary;
}

export function matchCandidateToOpportunities(
  candidate: BreezyCandidate,
  opportunities: MelOpportunity[],
  options: MatchCandidateOptions = {},
): CandidateMatchResult {
  const limit = options.limit ?? DEFAULT_LIMIT;
  const openOnly = options.openOnly ?? true;
  const candidateCity = candidate.city.trim();
  const candidateState = candidate.state.trim();

  const pool = opportunities.filter((o) => {
    if (openOnly && !o.openStatus) return false;
    return true;
  });

  const scored: CandidateOpportunityMatch[] = [];

  for (const opportunity of pool) {
    const distanceMiles = distanceBetweenLocations(
      candidateCity,
      candidateState,
      opportunity.city,
      opportunity.state,
    );

    const fit = scoreOpportunityFit({
      candidate,
      opportunity,
      distanceMiles,
      territoryStates: options.territoryStates,
      travelRadiusMiles: options.travelRadiusMiles,
    });

    scored.push({
      opportunityId: opportunity.opportunityId,
      projectName: opportunity.projectName,
      client: opportunity.client,
      storeAddress: opportunity.storeAddress,
      distanceMiles,
      fitPercent: fit.fitPercent,
      matchLabel: fit.matchLabel,
      territory: opportunity.territoryOwner,
      priority: opportunity.priority,
      summary: fit.summary,
    });
  }

  scored.sort((a, b) => {
    if (b.fitPercent !== a.fitPercent) return b.fitPercent - a.fitPercent;
    const da = a.distanceMiles ?? 9999;
    const db = b.distanceMiles ?? 9999;
    return da - db;
  });

  const matches = scored.slice(0, limit);

  return {
    matches,
    aiSummary: aggregateAiSummary(matches),
    travelRadiusMiles: options.travelRadiusMiles ?? DEFAULT_TRAVEL_RADIUS_MILES,
    opportunitiesConsidered: pool.length,
  };
}
