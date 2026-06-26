import { getDmForState, normalizeStateCode } from "@/lib/dm-territory-map";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import type { ActiveRep } from "@/lib/rep-intelligence/rep-types";
import {
  buildMarketKey,
  formatMarketLabel,
  resolvePriorityOverride,
} from "@/lib/workforce-placement-intelligence/priority-market-overrides";
import type {
  MarketDemandFactors,
  MarketIntelligenceRow,
} from "@/lib/workforce-placement-intelligence/types";

function normalizeCity(city: string): string {
  return city.trim().toLowerCase();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isOpenOpportunity(opportunity: MelOpportunity): boolean {
  return opportunity.openStatus && !opportunity.isStaffed;
}

function aggregateMarkets(input: {
  opportunities: MelOpportunity[];
  activeReps: ActiveRep[];
  referenceMs?: number;
}): MarketIntelligenceRow[] {
  const referenceMs = input.referenceMs ?? Date.now();
  const marketMap = new Map<
    string,
    {
      city: string;
      state: string;
      openStores: number;
      openOpportunities: number;
      repIds: Set<string>;
    }
  >();

  for (const opportunity of input.opportunities) {
    if (!opportunity.city.trim() || !opportunity.state.trim()) continue;
    const key = buildMarketKey(opportunity.city, opportunity.state);
    let bucket = marketMap.get(key);
    if (!bucket) {
      bucket = {
        city: opportunity.city.trim(),
        state: normalizeStateCode(opportunity.state),
        openStores: 0,
        openOpportunities: 0,
        repIds: new Set<string>(),
      };
      marketMap.set(key, bucket);
    }

    if (isOpenOpportunity(opportunity)) {
      bucket.openOpportunities += 1;
      bucket.openStores += 1;
    }
  }

  for (const rep of input.activeReps) {
    if (!rep.active || !rep.city.trim() || !rep.state.trim()) continue;
    const key = buildMarketKey(rep.city, rep.state);
    let bucket = marketMap.get(key);
    if (!bucket) {
      bucket = {
        city: rep.city.trim(),
        state: normalizeStateCode(rep.state),
        openStores: 0,
        openOpportunities: 0,
        repIds: new Set<string>(),
      };
      marketMap.set(key, bucket);
    }
    bucket.repIds.add(rep.repId);
  }

  const rows: MarketIntelligenceRow[] = [];

  for (const [marketKey, bucket] of marketMap.entries()) {
    const activeRepresentativeCount = bucket.repIds.size;
    const openStoreCount = bucket.openStores;
    const openOpportunityCount = bucket.openOpportunities;
    const coverageRatio =
      activeRepresentativeCount > 0 ? openStoreCount / activeRepresentativeCount : null;
    const staffingShortage =
      openStoreCount >= 3 &&
      (activeRepresentativeCount === 0 || (coverageRatio != null && coverageRatio >= 4));
    const futureWorkloadScore = Math.min(30, openOpportunityCount * 1.5);
    const priorityOverride = resolvePriorityOverride(marketKey, referenceMs);
    const priorityOverrideBoost = priorityOverride?.scoreBoost ?? 0;

    const extensions: Record<string, number> = {
      openStoreWeight: openStoreCount * 2,
      repCoveragePenalty: activeRepresentativeCount * 4,
      shortageBoost: staffingShortage ? 12 : 0,
    };

    const rawScore =
      extensions.openStoreWeight -
      extensions.repCoveragePenalty +
      extensions.shortageBoost +
      futureWorkloadScore +
      priorityOverrideBoost;

    const demandScore = clamp(Math.round(rawScore), 0, 100);
    const dmName = getDmForState(bucket.state) ?? null;

    rows.push({
      marketKey,
      marketLabel: formatMarketLabel(bucket.city, bucket.state),
      city: bucket.city,
      state: bucket.state,
      dmName,
      openStoreCount,
      activeRepresentativeCount,
      openOpportunityCount,
      demandScore,
      demandFactors: {
        openStoreCount,
        activeRepresentativeCount,
        staffingShortage,
        openOpportunityCount,
        futureWorkloadScore,
        coverageRatio,
        priorityOverrideBoost,
        extensions,
      },
      priorityOverride,
      recommended: demandScore >= 60 || priorityOverride != null,
      staffingShortage,
    });
  }

  return rows.sort((a, b) => b.demandScore - a.demandScore || a.marketLabel.localeCompare(b.marketLabel));
}

export function buildMarketIntelligenceSnapshot(input: {
  opportunities: MelOpportunity[];
  activeReps: ActiveRep[];
  referenceMs?: number;
}): {
  markets: MarketIntelligenceRow[];
  recommendedMarkets: MarketIntelligenceRow[];
  averageMarketDemand: number;
} {
  const markets = aggregateMarkets(input);
  const recommendedMarkets = markets.filter((row) => row.recommended);
  const averageMarketDemand =
    markets.length > 0
      ? Math.round(markets.reduce((sum, row) => sum + row.demandScore, 0) / markets.length)
      : 0;

  return { markets, recommendedMarkets, averageMarketDemand };
}

export function scoreCandidateMarketFit(input: {
  candidateCity: string;
  candidateState: string;
  market: MarketIntelligenceRow;
}): number {
  const candidateState = normalizeStateCode(input.candidateState);
  const marketState = normalizeStateCode(input.market.state);
  let score = input.market.demandScore;

  if (candidateState && marketState && candidateState === marketState) {
    score += 12;
  }

  if (
    normalizeCity(input.candidateCity) &&
    normalizeCity(input.candidateCity) === normalizeCity(input.market.city)
  ) {
    score += 18;
  }

  return score;
}

export function describeCoverageImpact(market: MarketIntelligenceRow, additionalCandidates = 1): string {
  const projectedReps = market.activeRepresentativeCount + additionalCandidates;
  if (market.openStoreCount === 0) {
    return "No open stores in this market preview snapshot.";
  }
  const storesPerRep = Math.round((market.openStoreCount / projectedReps) * 10) / 10;
  return `Projected ${storesPerRep} open stores per representative after placement (+${additionalCandidates} rep).`;
}

export function buildDemandFactorsSummary(factors: MarketDemandFactors): string[] {
  const lines: string[] = [];
  lines.push(`${factors.openStoreCount} open stores`);
  lines.push(`${factors.activeRepresentativeCount} active representatives`);
  if (factors.staffingShortage) lines.push("Staffing shortage detected");
  if (factors.priorityOverrideBoost > 0) {
    lines.push(`Priority override boost +${factors.priorityOverrideBoost}`);
  }
  return lines;
}
