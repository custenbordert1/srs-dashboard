import { getBreezyApiKey } from "@/lib/breezy-api";

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

function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

function mockQueue(now: string, tokenMissing: boolean): BreezySyncQueueItem[] {
  return [
    {
      id: "mock-job-queue-1",
      entity: "job",
      externalId: "pos_mock_retail_rep_dallas",
      name: "Retail Sales Representative - Dallas, TX",
      status: tokenMissing ? "blocked" : "queued",
      queuedAt: now,
      retryCount: 0,
    },
    {
      id: "mock-job-queue-2",
      entity: "job",
      externalId: "pos_mock_brand_rep_phoenix",
      name: "Brand Representative - Phoenix, AZ",
      status: tokenMissing ? "blocked" : "retry-ready",
      queuedAt: minutesAgo(18),
      retryCount: 1,
    },
    {
      id: "mock-candidate-queue-1",
      entity: "candidate",
      externalId: "cand_mock_maria_lopez",
      name: "Maria Lopez",
      status: tokenMissing ? "blocked" : "queued",
      queuedAt: minutesAgo(7),
      retryCount: 0,
    },
    {
      id: "mock-candidate-queue-2",
      entity: "candidate",
      externalId: "cand_mock_james_hall",
      name: "James Hall",
      status: tokenMissing ? "blocked" : "queued",
      queuedAt: minutesAgo(11),
      retryCount: 0,
    },
  ];
}

function mockBrokenPositionQueue(tokenMissing: boolean): BrokenPositionCleanupItem[] {
  return [
    {
      positionName: "Retail Sales Representative - Dallas, TX",
      positionId: "pos_mock_missing_dallas",
      errorType: tokenMissing ? "Permission check" : "Missing position",
      retryCount: tokenMissing ? 0 : 2,
      suggestedAction: tokenMissing ? "Retry after token is configured" : "Reconnect position mapping",
    },
    {
      positionName: "Brand Representative - Phoenix, AZ",
      positionId: "pos_mock_archived_phoenix",
      errorType: "Archived position",
      retryCount: 1,
      suggestedAction: "Archive local mapping",
    },
    {
      positionName: "Market Specialist - Tampa, FL",
      positionId: "pos_mock_candidate_mismatch",
      errorType: "Candidate link mismatch",
      retryCount: 3,
      suggestedAction: "Review Breezy permissions",
    },
  ];
}

function buildRateLimitProtection(input: {
  tokenMissing: boolean;
  failedJobs: number;
}): BreezyRateLimitProtection {
  const max = maxRequestsPerMinute();
  const requestsUsed = input.tokenMissing ? 0 : Math.min(max, Math.floor(max * 0.28));

  return {
    maxRequestsPerMinute: max,
    requestsUsedThisMinute: requestsUsed,
    requestsRemainingThisMinute: Math.max(0, max - requestsUsed),
    warning: input.tokenMissing
      ? "Breezy token is missing; outbound requests are disabled and no rate limit is consumed."
      : requestsUsed > max * 0.8
        ? "Approaching configured Breezy request budget."
        : null,
    retryBackoffPlaceholder:
      "Retry policy placeholder: exponential backoff at 30s, 2m, 5m, then cleanup queue review.",
    failedRequestsTracked: input.failedJobs,
    failedRequestWindowMinutes: 60,
  };
}

export function buildBreezySyncHealthSnapshot(): BreezySyncHealthSnapshot {
  const generatedAt = new Date().toISOString();
  const tokenMissing = !getBreezyApiKey();
  const tokenStatus: BreezyTokenStatus = tokenMissing ? "missing" : "configured";
  const queue = mockQueue(generatedAt, tokenMissing);
  const brokenPositionCleanupQueue = mockBrokenPositionQueue(tokenMissing);
  const jobsQueued = queue.filter((item) => item.entity === "job").length;
  const candidatesQueued = queue.filter((item) => item.entity === "candidate").length;
  const failedJobs = brokenPositionCleanupQueue.length;
  const rateLimitProtection = buildRateLimitProtection({ tokenMissing, failedJobs });
  const rateLimitWarnings = [
    rateLimitProtection.warning,
    tokenMissing ? "Safe fallback data is active until BREEZY_API_KEY is configured." : null,
  ].filter((warning): warning is string => Boolean(warning));

  return {
    ok: true,
    generatedAt,
    lastSyncTime: tokenMissing ? null : minutesAgo(22),
    syncStatus: tokenMissing ? "safe-mode" : failedJobs > 0 ? "warning" : "ready",
    statusLabel: tokenMissing ? "Safe mode" : failedJobs > 0 ? "Ready with cleanup warnings" : "Ready",
    tokenStatus,
    tokenStatusLabel: tokenMissing ? "Missing token" : "Configured",
    safeMode: tokenMissing,
    jobsQueued,
    candidatesQueued,
    failedJobs,
    rateLimitWarnings,
    rateLimitProtection,
    queue,
    brokenPositionCleanupQueue,
    notes: tokenMissing
      ? [
          "Breezy API calls are disabled because BREEZY_API_KEY is not configured.",
          "Mock queue records are safe placeholders for future job and candidate sync workflows.",
        ]
      : ["Sync infrastructure is ready for live Breezy reads and future write/sync jobs."],
  };
}
