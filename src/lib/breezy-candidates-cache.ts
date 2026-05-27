import type { BreezyCandidatesScanMode, BreezyCandidatesSuccess } from "@/lib/breezy-api";
import { logBreezyCandidatesOps } from "@/lib/breezy-candidates-ops-log";

export type BreezyCandidatesCacheTier = "all" | "full" | "fast" | "preview" | "none";

const CACHE_TIER_RANK: Record<BreezyCandidatesCacheTier, number> = {
  all: 4,
  full: 3,
  fast: 2,
  preview: 1,
  none: 0,
};

export type BreezyCandidatesCacheWriteDecision = {
  accepted: boolean;
  reason: string;
  tierBefore: BreezyCandidatesCacheTier;
  tierAfter: BreezyCandidatesCacheTier;
  countBefore: number;
  countAfter: number;
  countDelta: number;
  writeRejectedDueToLowerRichness: boolean;
  hydrationRoundId?: string;
};

export function resolveCandidatesCacheTier(
  scanMode?: BreezyCandidatesScanMode | string,
  hydrationComplete?: boolean,
): BreezyCandidatesCacheTier {
  if (scanMode === "all") return "all";
  if (scanMode === "full") return hydrationComplete ? "full" : "full";
  if (scanMode === "fast") return "fast";
  if (scanMode === "preview") return "preview";
  return "none";
}

/** Higher score = richer cache (tier, hydration, count, positions scanned). */
export function scoreCandidatesCacheRichness(snapshot: BreezyCandidatesSuccess): number {
  const tier = resolveCandidatesCacheTier(snapshot.scanMode, snapshot.hydrationComplete);
  const tierScore = CACHE_TIER_RANK[tier] * 1_000_000;
  const hydrationBonus = snapshot.hydrationComplete ? 500_000 : 0;
  const count = snapshot.candidates.length;
  const positionsScanned = snapshot.positionsScanned ?? 0;
  return tierScore + hydrationBonus + count * 1_000 + positionsScanned;
}

export function isRicherCandidatesCache(
  candidate: BreezyCandidatesSuccess,
  incumbent: BreezyCandidatesSuccess | null | undefined,
): boolean {
  if (!incumbent) {
    return candidate.candidates.length > 0 || CACHE_TIER_RANK[resolveCandidatesCacheTier(candidate.scanMode)] > 0;
  }
  return scoreCandidatesCacheRichness(candidate) > scoreCandidatesCacheRichness(incumbent);
}

export function shouldAcceptCandidatesCacheWrite(
  incoming: BreezyCandidatesSuccess,
  incumbent: BreezyCandidatesSuccess | null | undefined,
  context?: { hydrationRoundId?: string },
): BreezyCandidatesCacheWriteDecision {
  const tierBefore = resolveCandidatesCacheTier(incumbent?.scanMode, incumbent?.hydrationComplete);
  const tierAfter = resolveCandidatesCacheTier(incoming.scanMode, incoming.hydrationComplete);
  const countBefore = incumbent?.candidates.length ?? 0;
  const countAfter = incoming.candidates.length;
  const countDelta = countAfter - countBefore;
  const base = {
    tierBefore,
    tierAfter,
    countBefore,
    countAfter,
    countDelta,
    hydrationRoundId: context?.hydrationRoundId,
  };

  if (!incumbent) {
    return {
      ...base,
      accepted: countAfter > 0 || CACHE_TIER_RANK[tierAfter] >= CACHE_TIER_RANK.fast,
      reason: "initial_write",
      writeRejectedDueToLowerRichness: false,
    };
  }

  if (isRicherCandidatesCache(incoming, incumbent)) {
    return {
      ...base,
      accepted: true,
      reason: "richer_snapshot",
      writeRejectedDueToLowerRichness: false,
    };
  }

  if (countAfter < countBefore) {
    return {
      ...base,
      accepted: false,
      reason: "lower_candidate_count",
      writeRejectedDueToLowerRichness: true,
    };
  }

  if (CACHE_TIER_RANK[tierAfter] < CACHE_TIER_RANK[tierBefore]) {
    return {
      ...base,
      accepted: false,
      reason: "lower_tier",
      writeRejectedDueToLowerRichness: true,
    };
  }

  const incomingScanned = incoming.positionsScanned ?? 0;
  const incumbentScanned = incumbent.positionsScanned ?? 0;
  if (countAfter === countBefore && incomingScanned > incumbentScanned) {
    return {
      ...base,
      accepted: true,
      reason: "metadata_upgrade",
      writeRejectedDueToLowerRichness: false,
    };
  }

  return {
    ...base,
    accepted: false,
    reason: "not_richer_than_incumbent",
    writeRejectedDueToLowerRichness: true,
  };
}

export function pickRichestCandidatesSnapshot(
  snapshots: Array<BreezyCandidatesSuccess | null | undefined>,
): BreezyCandidatesSuccess | null {
  let best: BreezyCandidatesSuccess | null = null;
  for (const snapshot of snapshots) {
    if (!snapshot?.ok) continue;
    if (!best || scoreCandidatesCacheRichness(snapshot) > scoreCandidatesCacheRichness(best)) {
      best = snapshot;
    }
  }
  return best;
}

export function logCandidatesCacheWriteDecision(
  layer: "client" | "server" | "ui",
  cacheKey: string,
  decision: BreezyCandidatesCacheWriteDecision,
): void {
  logBreezyCandidatesOps(
    layer === "server" ? "server" : "client",
    decision.accepted ? "success" : "fallback",
    {
      phase: "cache_write",
      cacheWriteLayer: layer,
    cacheKey,
    cacheTierBefore: decision.tierBefore,
    cacheTierAfter: decision.tierAfter,
    candidateCountBefore: decision.countBefore,
    candidateCountAfter: decision.countAfter,
    candidateCountDelta: decision.countDelta,
    cacheReplacementReason: decision.reason,
    writeRejectedDueToLowerRichness: decision.writeRejectedDueToLowerRichness,
    hydrationRoundId: decision.hydrationRoundId ?? null,
  });
}
