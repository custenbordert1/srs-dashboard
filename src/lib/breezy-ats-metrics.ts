/**
 * Canonical Breezy ATS metrics — single source of truth for candidate/job counts
 * and sync completeness labels across Command Center, Overview, Candidates,
 * Automation, Data Health, and Executive Rollup.
 */

import {
  countCandidatesLast7Days,
  isPartialBreezyPositionSync,
  type BreezyCandidate,
  type BreezyCandidatesSuccess,
  type BreezyJobsSuccess,
} from "@/lib/breezy-api";
import type { DataTrustInput } from "@/lib/data-trust-state";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type BreezyAtsSyncTier = "full" | "partial" | "cached";

export type BreezyAtsMetrics = {
  /** Candidates in the current Breezy payload (may grow during hydration). */
  candidatesLoaded: number;
  publishedJobs: number;
  applicantsToday: number;
  applicants7d: number;
  positionsScanned: number;
  totalPositionsAvailable: number;
  positionsNotScanned: number;
  scanMode: string | null;
  syncTier: BreezyAtsSyncTier;
  partialSync: boolean;
  fromCache: boolean;
  stale: boolean;
  truncated: boolean;
  hydrationComplete: boolean | undefined;
  lastSuccessfulSync: string;
  lastSuccessfulSyncLabel: string;
  /** Breezy scan / truncation reasons. */
  partialReasons: string[];
  /** Non-Breezy partial sources (MEL sheet, etc.) — shown separately in UI. */
  ancillaryPartialErrors: string[];
};

function parseAppliedDate(raw: string): Date | null {
  if (!raw.trim()) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatSyncTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

/** Rolling 24h before fetchedAt — matches Command Center “Applicants Today”. */
export function countBreezyApplicantsToday(
  candidates: BreezyCandidate[],
  fetchedAtIso: string,
): number {
  const syncTime = new Date(fetchedAtIso);
  const syncMs = Number.isNaN(syncTime.getTime()) ? Date.now() : syncTime.getTime();
  const sinceToday = new Date(syncMs - MS_PER_DAY);
  return candidates.filter((candidate) => {
    const applied = parseAppliedDate(candidate.appliedDate);
    return applied !== null && applied >= sinceToday;
  }).length;
}

function buildPartialReasons(data: BreezyCandidatesSuccess): string[] {
  const reasons: string[] = [];
  const scanned = data.positionsScanned ?? 0;
  const total = data.totalPositionsAvailable ?? 0;
  const notScanned = Math.max(0, total - scanned);

  if (notScanned > 0) {
    reasons.push(
      `${notScanned.toLocaleString()} published position${notScanned === 1 ? "" : "s"} not scanned yet`,
    );
  }
  if (data.truncated) {
    reasons.push("Scan stopped early (time budget or rate limit)");
  }
  const skipped = data.skippedCandidatesReason;
  if (skipped?.positionScanTimedOut) {
    reasons.push(`${skipped.positionScanTimedOut} position(s) hit the scan time limit`);
  }
  if (skipped?.positionFetchFailed) {
    reasons.push(`${skipped.positionFetchFailed} position fetch(es) failed`);
  }
  if (skipped?.positionsNotScanned) {
    reasons.push(`${skipped.positionsNotScanned} position(s) skipped in scan queue`);
  }
  if (data.hydrationComplete === false) {
    reasons.push("Background hydration still loading remaining positions");
  }
  return reasons;
}

function resolveSyncTier(data: BreezyCandidatesSuccess, partialSync: boolean): BreezyAtsSyncTier {
  if (partialSync) return "partial";
  if (data.stale || data.fromCache) return "cached";
  return "full";
}

export function buildBreezyAtsMetrics(
  candidates: BreezyCandidatesSuccess,
  jobs?: BreezyJobsSuccess | null,
  options?: {
    /** Errors from non-Breezy dependencies (MEL sheet, etc.). */
    ancillaryPartialErrors?: string[];
    /** When territory filtering reduces visible rows (Automation, Executive). */
    candidatesLoadedOverride?: number;
    publishedJobsOverride?: number;
  },
): BreezyAtsMetrics {
  const positionsScanned = candidates.positionsScanned ?? 0;
  const totalPositionsAvailable = candidates.totalPositionsAvailable ?? positionsScanned;
  const positionsNotScanned = Math.max(0, totalPositionsAvailable - positionsScanned);
  const partialSync =
    isPartialBreezyPositionSync(candidates) ||
    Boolean(candidates.partial) ||
    candidates.hydrationComplete === false;

  const candidatesLoaded = options?.candidatesLoadedOverride ?? candidates.candidates.length;
  const publishedJobs = options?.publishedJobsOverride ?? jobs?.jobs.length ?? 0;

  return {
    candidatesLoaded,
    publishedJobs,
    applicantsToday: countBreezyApplicantsToday(candidates.candidates, candidates.fetchedAt),
    applicants7d:
      candidates.candidatesLast7Days ??
      countCandidatesLast7Days(candidates.candidates, candidates.fetchedAt),
    positionsScanned,
    totalPositionsAvailable,
    positionsNotScanned,
    scanMode: candidates.scanMode ?? null,
    syncTier: resolveSyncTier(candidates, partialSync),
    partialSync,
    fromCache: Boolean(candidates.fromCache),
    stale: Boolean(candidates.stale),
    truncated: Boolean(candidates.truncated),
    hydrationComplete: candidates.hydrationComplete,
    lastSuccessfulSync: candidates.fetchedAt,
    lastSuccessfulSyncLabel: formatSyncTimestamp(candidates.fetchedAt),
    partialReasons: partialSync ? buildPartialReasons(candidates) : [],
    ancillaryPartialErrors: options?.ancillaryPartialErrors ?? [],
  };
}

export function breezyAtsSyncTierLabel(tier: BreezyAtsSyncTier): string {
  switch (tier) {
    case "full":
      return "Full sync";
    case "partial":
      return "Partial sync";
    case "cached":
      return "Cached snapshot";
    default:
      return tier;
  }
}

export function formatBreezyAtsStatusHeadline(metrics: BreezyAtsMetrics): string {
  const tier = breezyAtsSyncTierLabel(metrics.syncTier);
  const loaded = `${metrics.candidatesLoaded.toLocaleString()} candidate${metrics.candidatesLoaded === 1 ? "" : "s"} loaded`;
  if (metrics.syncTier === "partial") {
    const scan =
      metrics.totalPositionsAvailable > 0
        ? `${metrics.positionsScanned.toLocaleString()} of ${metrics.totalPositionsAvailable.toLocaleString()} positions scanned`
        : null;
    return [tier, loaded, scan].filter(Boolean).join(" · ");
  }
  return `${tier} · ${loaded} · Last successful sync ${metrics.lastSuccessfulSyncLabel}`;
}

export function formatBreezyAtsStatusDetails(metrics: BreezyAtsMetrics): string[] {
  const lines: string[] = [
    `Last successful sync: ${metrics.lastSuccessfulSyncLabel}`,
    `Candidates loaded: ${metrics.candidatesLoaded.toLocaleString()}`,
    `Published jobs: ${metrics.publishedJobs.toLocaleString()}`,
    `Applicants (7 calendar days): ${metrics.applicants7d.toLocaleString()}`,
  ];
  if (metrics.scanMode) {
    lines.push(`Scan tier: ${metrics.scanMode}`);
  }
  if (metrics.totalPositionsAvailable > 0) {
    lines.push(
      `Positions scanned: ${metrics.positionsScanned.toLocaleString()} / ${metrics.totalPositionsAvailable.toLocaleString()}`,
    );
    if (metrics.positionsNotScanned > 0) {
      lines.push(`Positions not scanned: ${metrics.positionsNotScanned.toLocaleString()}`);
    }
  }
  for (const reason of metrics.partialReasons) {
    lines.push(reason);
  }
  return lines;
}

/** Automation / intelligence partial banner — separates Breezy from ancillary errors. */
export function formatAutomationAtsStatusMessage(metrics: BreezyAtsMetrics): string | null {
  const parts: string[] = [];
  if (metrics.partialSync) {
    parts.push(formatBreezyAtsStatusHeadline(metrics));
  } else if (metrics.syncTier === "cached") {
    parts.push(`Showing cached Breezy snapshot from ${metrics.lastSuccessfulSyncLabel}`);
  }
  if (metrics.ancillaryPartialErrors.length > 0) {
    parts.push(
      `Non-ATS data partial: ${metrics.ancillaryPartialErrors.join("; ")}`,
    );
  }
  if (parts.length === 0) return null;
  return parts.join(" — Operational recommendations remain available.");
}

export function breezyAtsToDataTrustInput(
  metrics: BreezyAtsMetrics,
  options?: { loading?: boolean; refreshing?: boolean; error?: string | null; timedOut?: boolean },
): DataTrustInput {
  return {
    loading: options?.loading,
    refreshing: options?.refreshing,
    error: options?.error,
    timedOut: options?.timedOut,
    hasData: metrics.candidatesLoaded > 0 || metrics.publishedJobs > 0,
    partialSync: metrics.partialSync,
    truncated: metrics.truncated,
    scanMode: metrics.scanMode,
    positionsScanned: metrics.positionsScanned,
    totalPositionsAvailable: metrics.totalPositionsAvailable,
    fromCache: metrics.fromCache,
    stale: metrics.stale,
  };
}

export type SerializedBreezyAtsMetrics = BreezyAtsMetrics;
