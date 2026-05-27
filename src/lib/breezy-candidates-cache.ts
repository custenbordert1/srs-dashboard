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
  downgradeSource?: string;
};

export type BreezyCandidatesSnapshotMeta = {
  candidateCount: number;
  positionsScanned: number;
  continuationPoint: number;
  hydrationPercent: number;
  tier: BreezyCandidatesCacheTier;
  scanMode?: string;
  hydrationRoundId?: string | null;
  richnessScore: number;
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

/** Higher score = richer cache (count and continuation dominate; tier breaks ties). */
export function scoreCandidatesCacheRichness(snapshot: BreezyCandidatesSuccess): number {
  const tier = resolveCandidatesCacheTier(snapshot.scanMode, snapshot.hydrationComplete);
  const tierScore = CACHE_TIER_RANK[tier];
  const count = snapshot.candidates.length;
  const positionsScanned = snapshot.positionsScanned ?? 0;
  const continuation = snapshot.hydrationJob?.lastContinuationPoint ?? positionsScanned;
  const hydrationPercent = snapshot.hydrationJob?.hydrationPercent ?? (snapshot.hydrationComplete ? 100 : 0);
  return (
    count * 10_000_000 +
    continuation * 10_000 +
    hydrationPercent * 100 +
    tierScore
  );
}

export function describeCandidatesSnapshotMeta(
  snapshot: BreezyCandidatesSuccess | null | undefined,
): BreezyCandidatesSnapshotMeta {
  const positionsScanned = snapshot?.positionsScanned ?? 0;
  const continuationPoint = snapshot?.hydrationJob?.lastContinuationPoint ?? positionsScanned;
  return {
    candidateCount: snapshot?.candidates.length ?? 0,
    positionsScanned,
    continuationPoint,
    hydrationPercent: snapshot?.hydrationJob?.hydrationPercent ?? 0,
    tier: resolveCandidatesCacheTier(snapshot?.scanMode, snapshot?.hydrationComplete),
    scanMode: snapshot?.scanMode,
    hydrationRoundId: snapshot?.hydrationJob?.hydrationRoundId ?? null,
    richnessScore: snapshot ? scoreCandidatesCacheRichness(snapshot) : 0,
  };
}

export function logDowngradeAttemptRejected(input: {
  layer: "client" | "server" | "ui";
  downgradeSource: string;
  reason: string;
  cacheKey?: string;
  previousSnapshotMeta: BreezyCandidatesSnapshotMeta;
  incomingSnapshotMeta: BreezyCandidatesSnapshotMeta;
  hydrationContinuationBefore?: number;
  hydrationContinuationAfter?: number;
  hydrationRoundId?: string;
}): void {
  logBreezyCandidatesOps(
    input.layer === "server" ? "server" : "client",
    "fallback",
    {
      phase: "downgradeAttemptRejected",
      downgradeSource: input.downgradeSource,
      downgradeReason: input.reason,
      cacheKey: input.cacheKey ?? null,
      previousSnapshotMeta: input.previousSnapshotMeta,
      incomingSnapshotMeta: input.incomingSnapshotMeta,
      hydrationContinuationBefore: input.hydrationContinuationBefore ?? input.previousSnapshotMeta.continuationPoint,
      hydrationContinuationAfter: input.hydrationContinuationAfter ?? input.incomingSnapshotMeta.continuationPoint,
      hydrationRoundId: input.hydrationRoundId ?? input.incomingSnapshotMeta.hydrationRoundId ?? null,
    },
  );
}

function monotonicRegressionReason(
  incoming: BreezyCandidatesSnapshotMeta,
  incumbent: BreezyCandidatesSnapshotMeta,
): string | null {
  if (incoming.candidateCount < incumbent.candidateCount) return "lower_candidate_count";
  if (incoming.continuationPoint < incumbent.continuationPoint) return "lower_continuation_point";
  if (incoming.positionsScanned < incumbent.positionsScanned) return "lower_positions_scanned";
  if (
    incoming.hydrationPercent < incumbent.hydrationPercent &&
    incoming.candidateCount <= incumbent.candidateCount
  ) {
    return "lower_hydration_percent";
  }
  if (CACHE_TIER_RANK[incoming.tier] < CACHE_TIER_RANK[incumbent.tier] && incoming.candidateCount < incumbent.candidateCount) {
    return "lower_tier";
  }
  return null;
}

export function isRicherCandidatesCache(
  candidate: BreezyCandidatesSuccess,
  incumbent: BreezyCandidatesSuccess | null | undefined,
): boolean {
  if (!incumbent) {
    return candidate.candidates.length > 0 || CACHE_TIER_RANK[resolveCandidatesCacheTier(candidate.scanMode)] > 0;
  }
  const incomingMeta = describeCandidatesSnapshotMeta(candidate);
  const incumbentMeta = describeCandidatesSnapshotMeta(incumbent);
  if (monotonicRegressionReason(incomingMeta, incumbentMeta)) return false;
  return scoreCandidatesCacheRichness(candidate) > scoreCandidatesCacheRichness(incumbent);
}

export function shouldAcceptCandidatesCacheWrite(
  incoming: BreezyCandidatesSuccess,
  incumbent: BreezyCandidatesSuccess | null | undefined,
  context?: { hydrationRoundId?: string; downgradeSource?: string; layer?: "client" | "server" | "ui" },
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
    downgradeSource: context?.downgradeSource,
  };

  if (!incumbent) {
    return {
      ...base,
      accepted: countAfter > 0 || CACHE_TIER_RANK[tierAfter] >= CACHE_TIER_RANK.fast,
      reason: "initial_write",
      writeRejectedDueToLowerRichness: false,
    };
  }

  const incomingMeta = describeCandidatesSnapshotMeta(incoming);
  const incumbentMeta = describeCandidatesSnapshotMeta(incumbent);
  const regression = monotonicRegressionReason(incomingMeta, incumbentMeta);
  if (regression) {
    logDowngradeAttemptRejected({
      layer: context?.layer ?? "client",
      downgradeSource: context?.downgradeSource ?? "shouldAcceptCandidatesCacheWrite",
      reason: regression,
      previousSnapshotMeta: incumbentMeta,
      incomingSnapshotMeta: incomingMeta,
      hydrationRoundId: context?.hydrationRoundId,
    });
    return {
      ...base,
      accepted: false,
      reason: regression,
      writeRejectedDueToLowerRichness: true,
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

  if (incomingMeta.continuationPoint > incumbentMeta.continuationPoint) {
    return {
      ...base,
      accepted: true,
      reason: "continuation_upgrade",
      writeRejectedDueToLowerRichness: false,
    };
  }

  if (countAfter === countBefore && incomingMeta.positionsScanned > incumbentMeta.positionsScanned) {
    return {
      ...base,
      accepted: true,
      reason: "metadata_upgrade",
      writeRejectedDueToLowerRichness: false,
    };
  }

  logDowngradeAttemptRejected({
    layer: context?.layer ?? "client",
    downgradeSource: context?.downgradeSource ?? "shouldAcceptCandidatesCacheWrite",
    reason: "not_richer_than_incumbent",
    previousSnapshotMeta: incumbentMeta,
    incomingSnapshotMeta: incomingMeta,
    hydrationRoundId: context?.hydrationRoundId,
  });

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
      downgradeSource: decision.downgradeSource ?? null,
    },
  );
}
