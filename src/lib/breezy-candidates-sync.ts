import type {
  BreezyCandidate,
  BreezyCandidatesResult,
  BreezyCandidatesSuccess,
} from "@/lib/breezy-api";
import { isPartialBreezyPositionSync } from "@/lib/breezy-api";
import { logBreezyCandidatesOps } from "@/lib/breezy-candidates-ops-log";
import {
  logCandidatesCacheWriteDecision,
  pickRichestCandidatesSnapshot,
  shouldAcceptCandidatesCacheWrite,
} from "@/lib/breezy-candidates-cache";
import { mergeHydrationJobSnapshots } from "@/lib/breezy-candidates-hydration";

export type {
  BreezyCandidatesCacheTier,
  BreezyCandidatesCacheWriteDecision,
} from "@/lib/breezy-candidates-cache";
export {
  describeCandidatesSnapshotMeta,
  isRicherCandidatesCache,
  logCandidatesCacheWriteDecision,
  logDowngradeAttemptRejected,
  pickRichestCandidatesSnapshot,
  resolveCandidatesCacheTier,
  scoreCandidatesCacheRichness,
  shouldAcceptCandidatesCacheWrite,
} from "@/lib/breezy-candidates-cache";
export type { BreezyCandidatesSnapshotMeta } from "@/lib/breezy-candidates-cache";

export const BREEZY_CANDIDATES_SOURCE = {
  label: "Breezy HR API",
  apiPath: "/api/breezy/candidates",
} as const;

export const CANDIDATES_WORKFLOW_SOURCE = {
  label: "SRS local workflows",
  apiPath: "/api/candidates/workflows",
} as const;

export type BreezyCandidatesSyncFields = {
  source: typeof BREEZY_CANDIDATES_SOURCE.label;
  sourcePath: typeof BREEZY_CANDIDATES_SOURCE.apiPath;
  fromCache: boolean;
  stale?: boolean;
  partial?: boolean;
  refreshError?: string;
};

export type BreezyCandidatesFailureWithSource = {
  ok: false;
  error: string;
  fetchedAt: string;
  source: typeof BREEZY_CANDIDATES_SOURCE.label;
  sourcePath: typeof BREEZY_CANDIDATES_SOURCE.apiPath;
  /** True when error response is shown but UI still has a prior ok snapshot. */
  showingCachedSnapshot?: boolean;
};

export type BreezyCandidatesResultWithSync = BreezyCandidatesResult & Partial<BreezyCandidatesSyncFields>;

const lastOkByCacheKey = new Map<string, BreezyCandidatesSuccess>();

export function getRichestOkCandidatesSnapshot(): BreezyCandidatesSuccess | null {
  return pickRichestCandidatesSnapshot([...lastOkByCacheKey.values()]);
}

export function rememberOkCandidatesSnapshot(
  cacheKey: string,
  snapshot: BreezyCandidatesSuccess,
  context?: { hydrationRoundId?: string; downgradeSource?: string },
): boolean {
  const prior = lastOkByCacheKey.get(cacheKey) ?? null;
  const globalRichest = getRichestOkCandidatesSnapshot();
  const incumbent = pickRichestCandidatesSnapshot([prior, globalRichest]);
  const decision = shouldAcceptCandidatesCacheWrite(snapshot, incumbent, {
    ...context,
    layer: "server",
    downgradeSource: context?.downgradeSource ?? `rememberOkCandidatesSnapshot:${cacheKey}`,
  });
  logCandidatesCacheWriteDecision("server", cacheKey, decision);
  if (!decision.accepted) return false;
  lastOkByCacheKey.set(cacheKey, snapshot);
  return true;
}

export function getStaleOkCandidatesSnapshot(cacheKey: string): BreezyCandidatesSuccess | null {
  return lastOkByCacheKey.get(cacheKey) ?? null;
}

export function isPartialCandidatesSync(data: BreezyCandidatesSuccess): boolean {
  return isPartialBreezyPositionSync(data);
}

export function withCandidatesSyncMeta(
  result: BreezyCandidatesSuccess,
  meta: Pick<BreezyCandidatesSyncFields, "fromCache" | "stale" | "partial" | "refreshError">,
): BreezyCandidatesSuccess & BreezyCandidatesSyncFields {
  const partial = meta.partial ?? isPartialCandidatesSync(result);
  return {
    ...result,
    source: BREEZY_CANDIDATES_SOURCE.label,
    sourcePath: BREEZY_CANDIDATES_SOURCE.apiPath,
    fromCache: meta.fromCache,
    stale: meta.stale,
    partial: partial || undefined,
    refreshError: meta.refreshError,
  };
}

export function withCandidatesFailureMeta(
  error: string,
  fetchedAt: string,
): BreezyCandidatesFailureWithSource {
  return {
    ok: false,
    error,
    fetchedAt,
    source: BREEZY_CANDIDATES_SOURCE.label,
    sourcePath: BREEZY_CANDIDATES_SOURCE.apiPath,
  };
}

/** Merge full-tier rows into a fast-tier snapshot without clearing existing candidates. */
export function mergeCandidatesSnapshots(
  base: BreezyCandidatesSuccess,
  addition: BreezyCandidatesSuccess,
  context?: { downgradeSource?: string },
): BreezyCandidatesSuccess {
  const continuationBefore = Math.max(
    base.hydrationJob?.lastContinuationPoint ?? 0,
    base.positionsScanned ?? 0,
  );
  const byId = new Map<string, BreezyCandidate>();
  for (const candidate of base.candidates) {
    byId.set(candidate.candidateId, candidate);
  }
  for (const candidate of addition.candidates) {
    byId.set(candidate.candidateId, candidate);
  }

  const mergedCandidates = [...byId.values()];
  const total = Math.max(
    base.totalPositionsAvailable ?? 0,
    addition.totalPositionsAvailable ?? 0,
  );
  const mergedHydrationJob = mergeHydrationJobSnapshots(base.hydrationJob, addition.hydrationJob);
  const scanned = Math.max(
    base.positionsScanned ?? 0,
    addition.positionsScanned ?? 0,
    mergedHydrationJob?.lastContinuationPoint ?? 0,
  );
  const continuationAfter = mergedHydrationJob?.lastContinuationPoint ?? scanned;
  const hydrationComplete =
    addition.hydrationComplete ??
    mergedHydrationJob?.hydrationComplete ??
    scanned >= total;

  const tierRank = (scan?: string) =>
    scan === "all" ? 4 : scan === "full" ? 3 : scan === "fast" ? 2 : scan === "preview" ? 1 : 0;
  const richerScanMode =
    tierRank(addition.scanMode) >= tierRank(base.scanMode) ? addition.scanMode : base.scanMode;

  const merged: BreezyCandidatesSuccess = {
    ...addition,
    candidates: mergedCandidates,
    totalPositionsAvailable: total,
    totalPositions: total,
    positionsScanned: scanned,
    totalCandidatesPulled: mergedCandidates.length,
    totalCandidatesFetched: mergedCandidates.length,
    truncated: addition.truncated && mergedCandidates.length <= base.candidates.length,
    partial: !hydrationComplete && scanned < total,
    hydrationComplete,
    hydrationDiagnostics: addition.hydrationDiagnostics ?? base.hydrationDiagnostics,
    hydrationJob: mergedHydrationJob,
    scanMode: richerScanMode ?? addition.scanMode ?? base.scanMode,
    warnings: [...new Set([...(base.warnings ?? []), ...(addition.warnings ?? [])])],
    syncNotes: [...new Set([...(base.syncNotes ?? []), ...(addition.syncNotes ?? [])])],
    fetchedAt:
      [base.fetchedAt, addition.fetchedAt].sort().at(-1) ?? addition.fetchedAt ?? base.fetchedAt,
    source: base.source ?? addition.source,
    sourcePath: base.sourcePath ?? addition.sourcePath,
  };

  if (continuationAfter < continuationBefore) {
    logBreezyCandidatesOps("server", "fallback", {
      phase: "merge_regress_blocked",
      downgradeSource: context?.downgradeSource ?? "mergeCandidatesSnapshots",
      hydrationContinuationBefore: continuationBefore,
      hydrationContinuationAfter: continuationAfter,
      candidateCountBefore: base.candidates.length,
      candidateCountAfter: merged.candidates.length,
    });
    return {
      ...base,
      hydrationJob: mergedHydrationJob ?? base.hydrationJob,
      positionsScanned: Math.max(base.positionsScanned ?? 0, continuationBefore),
    };
  }

  return merged;
}

export function buildCandidatesSyncAlert(data: BreezyCandidatesSuccess): string | null {
  const parts: string[] = [];
  if (data.stale && data.refreshError) {
    parts.push(
      `Showing cached Breezy candidates from ${formatSyncTimestamp(data.fetchedAt)} — latest refresh failed: ${data.refreshError}`,
    );
  } else if (data.stale) {
    parts.push(
      `Showing cached Breezy candidates from ${formatSyncTimestamp(data.fetchedAt)} while refresh is unavailable.`,
    );
  }
  if (data.partial && data.hydrationComplete === false) {
    parts.push("Loading remaining published positions in the background…");
  }
  if (data.partial) {
    const scanned = data.positionsScanned ?? 0;
    const total = data.totalPositionsAvailable ?? 0;
    if (total > 0 && scanned < total) {
      parts.push(`Partial sync: scanned ${scanned.toLocaleString()} of ${total.toLocaleString()} published positions.`);
    }
    if (data.truncated) parts.push("Scan stopped early (time budget or rate limit).");
    const skipped = data.skippedCandidatesReason;
    if (skipped?.positionScanTimedOut) {
      parts.push(`${skipped.positionScanTimedOut} position(s) hit the scan time limit.`);
    }
    if (skipped?.positionFetchFailed) {
      parts.push(`${skipped.positionFetchFailed} position(s) failed to load.`);
    }
  }
  if (data.warnings?.length) {
    parts.push(...data.warnings.slice(0, 2));
  }
  return parts.length > 0 ? parts.join(" ") : null;
}

function formatSyncTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

export function hasPopulatedCandidatesSnapshot(
  result: BreezyCandidatesResult,
): result is BreezyCandidatesSuccess {
  return result.ok === true && result.candidates.length > 0;
}

export function logCandidatesPipelineStage(
  stage: string,
  counts: Record<string, number | string | boolean | undefined>,
): void {
  console.info("[candidates-pipeline]", stage, counts);
}

export function timeoutShowsCachedCandidatesMessage(
  timeoutMs: number,
  showingCached: boolean,
): string {
  const seconds = Math.round(timeoutMs / 1000);
  if (showingCached) {
    return `Breezy candidate sync timed out after ${seconds}s. Showing cached candidates from your last successful sync — try Refresh again.`;
  }
  return `Breezy candidate sync timed out after ${seconds}s. Try Refresh again.`;
}
