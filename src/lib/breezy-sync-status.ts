import { fetchBreezyCandidates, fetchBreezyJobs, getBreezyApiKey } from "@/lib/breezy-api";

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

export async function buildBreezySyncHealthSnapshot(): Promise<BreezySyncHealthSnapshot> {
  const generatedAt = new Date().toISOString();
  const tokenMissing = !getBreezyApiKey();
  const tokenStatus: BreezyTokenStatus = tokenMissing ? "missing" : "configured";
  const queue: BreezySyncQueueItem[] = [];
  const brokenPositionCleanupQueue: BrokenPositionCleanupItem[] = [];

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
      notes: ["Breezy API calls are disabled until BREEZY_API_KEY is configured."],
    };
  }

  const [jobsResult, candidatesResult] = await Promise.all([
    fetchBreezyJobs(),
    fetchBreezyCandidates(),
  ]);
  const failures = [
    jobsResult.ok ? null : jobsResult.error,
    candidatesResult.ok ? null : candidatesResult.error,
  ].filter((error): error is string => Boolean(error));
  const rateLimited = failures.some(isRateLimitError);
  const authFailed = failures.some(isAuthError);
  const rateLimitProtection = buildRateLimitProtection({
    tokenMissing,
    failedRequests: failures.length,
    requestsAttempted: 2 + (candidatesResult.ok ? candidatesResult.positionsScanned ?? 0 : 0),
    rateLimited,
  });
  const liveWarnings = [
    rateLimitProtection.warning,
    candidatesResult.ok ? candidatesResult.warnings?.join(" ") : null,
    ...failures,
  ].filter((warning): warning is string => Boolean(warning));
  const lastSyncTime = [jobsResult, candidatesResult]
    .filter((result) => result.ok)
    .map((result) => result.fetchedAt)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;
  const jobsCount = jobsResult.ok ? jobsResult.jobs.length : 0;
  const candidatesCount = candidatesResult.ok ? candidatesResult.candidates.length : 0;
  const syncStatus: BreezySyncStatus =
    failures.length === 0 ? "ready" : authFailed ? "failed" : rateLimited || lastSyncTime ? "warning" : "failed";

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
    notes: [
      `Live Breezy jobs visible: ${jobsCount.toLocaleString()}.`,
      `Live Breezy candidates visible in bounded scan: ${candidatesCount.toLocaleString()}.`,
    ],
  };
}
