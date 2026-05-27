import { getBreezyApiKeySync, loadConfig } from "@/lib/config";
import {
  fetchBreezyJobs,
  peekBreezyCandidatesCache,
  type BreezySkippedCandidatesReason,
} from "@/lib/breezy-api";
import { getHydrationJobState, toHydrationJobSnapshot } from "@/lib/breezy-candidates-hydration";

export type BreezySyncEntity = "job" | "candidate";

export type BreezySyncStatus =
  | "ready"
  | "safe-mode"
  | "queued"
  | "syncing"
  | "warning"
  | "failed";

export type BreezyTokenStatus = "configured" | "missing";

export type BreezySyncQueueItem = {
  id: string;
  entity: BreezySyncEntity;
  externalId: string;
  name: string;
  status: "queued" | "blocked" | "retry-ready";
  queuedAt: string;
  retryCount: number;
};

export type BreezyRateLimitProtection = {
  maxRequestsPerMinute: number;
  requestsUsedThisMinute: number;
  requestsRemainingThisMinute: number;
  warning: string | null;
  retryBackoffPlaceholder: string;
  failedRequestsTracked: number;
  failedRequestWindowMinutes: number;
};

export type BrokenPositionCleanupItem = {
  positionName: string;
  positionId: string;
  errorType: "Missing position" | "Archived position" | "Candidate link mismatch" | "Permission check";
  retryCount: number;
  suggestedAction:
    | "Retry after token is configured"
    | "Reconnect position mapping"
    | "Archive local mapping"
    | "Review Breezy permissions";
};

export type BreezyJobSyncHealth = {
  publishedCount: number;
  draftCount: number;
  fetchedAt: string | null;
  error: string | null;
};

export type BreezyCandidateSyncHealth = {
  fromCache: boolean;
  candidateCount: number;
  fetchedAt: string | null;
  truncated: boolean;
  partial: boolean;
  hydrationComplete: boolean | null;
  scanMode: string | null;
  positionsScanned: number | null;
  positionsAvailable: number | null;
  skippedReason: string | null;
  warnings: string[];
  hydrationDiagnostics?: import("@/lib/breezy-api").BreezyHydrationDiagnostics | null;
  hydrationJob?: import("@/lib/breezy-candidates-hydration").BreezyHydrationJobSnapshot | null;
};

export type BreezySyncHealthSnapshot = {
  ok: true;
  generatedAt: string;
  lastSyncTime: string | null;
  syncStatus: BreezySyncStatus;
  statusLabel: string;
  tokenStatus: BreezyTokenStatus;
  tokenStatusLabel: string;
  safeMode: boolean;
  jobsQueued: number;
  candidatesQueued: number;
  failedJobs: number;
  rateLimitWarnings: string[];
  rateLimitProtection: BreezyRateLimitProtection;
  queue: BreezySyncQueueItem[];
  brokenPositionCleanupQueue: BrokenPositionCleanupItem[];
  jobSync: BreezyJobSyncHealth;
  candidateSync: BreezyCandidateSyncHealth;
  notes: string[];
};

const DEFAULT_MAX_REQUESTS_PER_MINUTE = 45;

function maxRequestsPerMinute(): number {
  const parsed = Number.parseInt(process.env.BREEZY_SYNC_MAX_REQUESTS_PER_MINUTE ?? "", 10);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return DEFAULT_MAX_REQUESTS_PER_MINUTE;
}

function buildRateLimitProtection(input: {
  tokenMissing: boolean;
  failedRequests: number;
  requestsAttempted: number;
  rateLimited: boolean;
}): BreezyRateLimitProtection {
  const max = maxRequestsPerMinute();
  const requestsUsed = input.tokenMissing ? 0 : Math.min(max, input.requestsAttempted);

  return {
    maxRequestsPerMinute: max,
    requestsUsedThisMinute: requestsUsed,
    requestsRemainingThisMinute: Math.max(0, max - requestsUsed),
    warning: input.tokenMissing
      ? "Breezy token is missing; outbound requests are disabled and no rate limit is consumed."
      : input.rateLimited
        ? "Breezy reported a rate limit response during the live health check."
        : null,
    retryBackoffPlaceholder:
      "Read-only checks use bounded requests and should be retried after Breezy recovers or rate limits reset.",
    failedRequestsTracked: input.failedRequests,
    failedRequestWindowMinutes: 60,
  };
}

function isRateLimitError(error: string): boolean {
  return error.toLowerCase().includes("rate limit") || error.includes("429");
}

function isAuthError(error: string): boolean {
  const lower = error.toLowerCase();
  return lower.includes("authentication failed") || lower.includes("access token") || lower.includes("unauthorized");
}

function formatSkippedCandidatesReason(reason: BreezySkippedCandidatesReason): string {
  const parts = Object.entries(reason)
    .filter(([, value]) => typeof value === "number" && value > 0)
    .map(([key, value]) => `${key}: ${value}`);
  return parts.length > 0 ? parts.join(", ") : "none";
}

export async function buildBreezySyncHealthSnapshot(): Promise<BreezySyncHealthSnapshot> {
  await loadConfig();
  const generatedAt = new Date().toISOString();
  const tokenMissing = !getBreezyApiKeySync();
  const tokenStatus: BreezyTokenStatus = tokenMissing ? "missing" : "configured";
  const queue: BreezySyncQueueItem[] = [];
  const brokenPositionCleanupQueue: BrokenPositionCleanupItem[] = [];

  const emptyJobSync: BreezyJobSyncHealth = {
    publishedCount: 0,
    draftCount: 0,
    fetchedAt: null,
    error: null,
  };
  const emptyCandidateSync: BreezyCandidateSyncHealth = {
    fromCache: false,
    candidateCount: 0,
    fetchedAt: null,
    truncated: false,
    partial: false,
    hydrationComplete: null,
    scanMode: null,
    positionsScanned: null,
    positionsAvailable: null,
    skippedReason: null,
    warnings: [],
  };

  if (tokenMissing) {
    const rateLimitProtection = buildRateLimitProtection({
      tokenMissing,
      failedRequests: 0,
      requestsAttempted: 0,
      rateLimited: false,
    });
    return {
      ok: true,
      generatedAt,
      lastSyncTime: null,
      syncStatus: "safe-mode",
      statusLabel: "Waiting on Breezy API key",
      tokenStatus,
      tokenStatusLabel: "Missing token",
      safeMode: true,
      jobsQueued: 0,
      candidatesQueued: 0,
      failedJobs: 0,
      rateLimitWarnings: [rateLimitProtection.warning].filter((warning): warning is string => Boolean(warning)),
      rateLimitProtection,
      queue,
      brokenPositionCleanupQueue,
      jobSync: emptyJobSync,
      candidateSync: emptyCandidateSync,
      notes: ["Breezy API calls are disabled until BREEZY_API_KEY is configured."],
    };
  }

  const [publishedJobsResult, draftJobsResult] = await Promise.all([
    fetchBreezyJobs("published"),
    fetchBreezyJobs("draft"),
  ]);
  const cachedCandidates = peekBreezyCandidatesCache();
  const candidatesFromCache = Boolean(cachedCandidates?.ok);

  const jobFailures = [
    publishedJobsResult.ok ? null : publishedJobsResult.error,
    draftJobsResult.ok ? null : draftJobsResult.error,
  ].filter((error): error is string => Boolean(error));
  const failures = jobFailures;
  const rateLimited = failures.some(isRateLimitError);
  const authFailed = failures.some(isAuthError);
  const rateLimitProtection = buildRateLimitProtection({
    tokenMissing,
    failedRequests: failures.length,
    requestsAttempted: 2 + (candidatesFromCache ? 1 : 0),
    rateLimited,
  });
  const candidateWarnings =
    cachedCandidates?.ok === true ? (cachedCandidates.warnings ?? []) : [];
  const liveWarnings = [
    rateLimitProtection.warning,
    ...candidateWarnings,
    !candidatesFromCache ? "Candidate totals use cache peek only (no live full scan on sync-health)." : null,
    ...failures,
  ].filter((warning): warning is string => Boolean(warning));
  const lastSyncTime = [publishedJobsResult, draftJobsResult, cachedCandidates]
    .filter((result): result is NonNullable<typeof result> => Boolean(result?.ok))
    .map((result) => result.fetchedAt)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;

  const publishedCount = publishedJobsResult.ok ? publishedJobsResult.jobs.length : 0;
  const draftCount = draftJobsResult.ok ? draftJobsResult.jobs.length : 0;
  const candidatesCount = cachedCandidates?.ok ? cachedCandidates.candidates.length : 0;
  const candidateTruncated = cachedCandidates?.ok === true ? Boolean(cachedCandidates.truncated) : false;
  const positionsScanned =
    cachedCandidates?.ok === true ? (cachedCandidates.positionsScanned ?? null) : null;
  const positionsAvailable =
    cachedCandidates?.ok === true
      ? (cachedCandidates.totalPositionsAvailable ?? cachedCandidates.totalPositions ?? null)
      : null;

  const jobSync: BreezyJobSyncHealth = {
    publishedCount,
    draftCount,
    fetchedAt: lastSyncTime,
    error: jobFailures[0] ?? null,
  };

  const candidatePartial =
    cachedCandidates?.ok === true
      ? Boolean(
          cachedCandidates.partial ||
            cachedCandidates.hydrationComplete === false ||
            candidateTruncated,
        )
      : !candidatesFromCache;

  const activeHydrationJob =
    cachedCandidates?.ok === true
      ? getHydrationJobState(cachedCandidates.companyId) ??
        (cachedCandidates.hydrationJob
          ? cachedCandidates.hydrationJob
          : null)
      : null;
  const hydrationJobSnapshot = activeHydrationJob
    ? "expiresAt" in activeHydrationJob
      ? toHydrationJobSnapshot(activeHydrationJob)
      : activeHydrationJob
    : null;

  const candidateSync: BreezyCandidateSyncHealth = {
    fromCache: candidatesFromCache,
    candidateCount: candidatesCount,
    fetchedAt: cachedCandidates?.ok ? cachedCandidates.fetchedAt : null,
    truncated: candidateTruncated,
    partial: candidatePartial,
    hydrationComplete:
      hydrationJobSnapshot?.hydrationComplete ??
      (cachedCandidates?.ok === true ? (cachedCandidates.hydrationComplete ?? null) : null),
    scanMode: cachedCandidates?.ok === true ? (cachedCandidates.scanMode ?? null) : null,
    positionsScanned: hydrationJobSnapshot?.positionsScanned ?? positionsScanned,
    positionsAvailable:
      hydrationJobSnapshot?.totalPositionsAvailable ?? positionsAvailable,
    skippedReason: cachedCandidates?.ok
      ? cachedCandidates.skippedCandidatesReason
        ? formatSkippedCandidatesReason(cachedCandidates.skippedCandidatesReason)
        : null
      : null,
    warnings: candidateWarnings,
    hydrationDiagnostics:
      cachedCandidates?.ok === true ? (cachedCandidates.hydrationDiagnostics ?? null) : null,
    hydrationJob: hydrationJobSnapshot,
  };

  if (candidateTruncated && cachedCandidates?.ok) {
    brokenPositionCleanupQueue.push({
      positionName: "Candidate aggregation",
      positionId: "all-positions",
      errorType: "Candidate link mismatch",
      retryCount: 0,
      suggestedAction: "Review Breezy permissions",
    });
  }

  const syncStatus: BreezySyncStatus =
    failures.length === 0 && !candidateTruncated
      ? "ready"
      : authFailed
        ? "failed"
        : rateLimited || lastSyncTime || candidateTruncated
          ? "warning"
          : "failed";

  return {
    ok: true,
    generatedAt,
    lastSyncTime,
    syncStatus,
    statusLabel:
      syncStatus === "ready"
        ? "Live Breezy reads connected"
        : syncStatus === "warning"
          ? "Live Breezy reads partially available"
          : "Breezy live reads failed",
    tokenStatus,
    tokenStatusLabel: "Configured",
    safeMode: tokenMissing,
    jobsQueued: 0,
    candidatesQueued: 0,
    failedJobs: failures.length,
    rateLimitWarnings: liveWarnings,
    rateLimitProtection,
    queue,
    brokenPositionCleanupQueue,
    jobSync,
    candidateSync,
    notes: [
      `Published Breezy jobs: ${publishedCount.toLocaleString()}.`,
      `Draft Breezy jobs: ${draftCount.toLocaleString()}.`,
      candidatesFromCache
        ? `Cached Breezy candidates (${cachedCandidates?.ok && cachedCandidates.scanMode ? cachedCandidates.scanMode : "warmed"} tier): ${candidatesCount.toLocaleString()}${candidatePartial ? " (partial)" : ""}.`
        : "Candidate cache cold — open Candidates or Command Center to warm sync.",
      candidateTruncated
        ? `Candidate sync truncated (${cachedCandidates?.ok && cachedCandidates.skippedCandidatesReason ? formatSkippedCandidatesReason(cachedCandidates.skippedCandidatesReason) : "see warnings"}).`
        : positionsScanned !== null && positionsAvailable !== null
          ? `Positions scanned: ${positionsScanned.toLocaleString()} / ${positionsAvailable.toLocaleString()}.`
          : "Sync health is lightweight and does not start a full position scan.",
    ],
  };
}
