import { buildBreezySyncHealthSnapshot } from "@/lib/breezy-sync-status";

export type AtsHealthSeverity = "healthy" | "warning" | "degraded" | "offline";

export type AtsDataFreshness = "current" | "stale" | "unknown";

export type AtsHealthSnapshot = {
  ok: true;
  generatedAt: string;
  severity: AtsHealthSeverity;
  statusLabel: string;
  lastSuccessfulSync: string | null;
  lastFailedSync: string | null;
  lastFailureMessage: string | null;
  jobsCached: number;
  candidatesCached: number;
  syncDurationMs: number | null;
  consecutiveFailures: number;
  cacheAgeMs: number | null;
  dataFreshness: AtsDataFreshness;
  dataFreshnessLabel: string;
  notes: string[];
};

const STALE_AFTER_MS = 15 * 60 * 1000;
const WARNING_AFTER_MS = 5 * 60 * 1000;

let lastSuccessfulSync: string | null = null;
let lastFailedSync: string | null = null;
let lastFailureMessage: string | null = null;
let consecutiveFailures = 0;
let lastSyncDurationMs: number | null = null;

export function recordAtsSyncSuccess(durationMs: number, fetchedAt: string): void {
  lastSuccessfulSync = fetchedAt;
  lastSyncDurationMs = durationMs;
  consecutiveFailures = 0;
  lastFailureMessage = null;
}

export function recordAtsSyncFailure(message: string): void {
  lastFailedSync = new Date().toISOString();
  lastFailureMessage = message;
  consecutiveFailures += 1;
}

export function resetAtsHealthTelemetryForTests(): void {
  lastSuccessfulSync = null;
  lastFailedSync = null;
  lastFailureMessage = null;
  consecutiveFailures = 0;
  lastSyncDurationMs = null;
}

function formatRelativeAge(ms: number): string {
  if (ms < 60_000) return "just now";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  return `${hours} hour${hours === 1 ? "" : "s"} ago`;
}

function resolveDataFreshness(cacheAgeMs: number | null, hasCache: boolean): {
  dataFreshness: AtsDataFreshness;
  dataFreshnessLabel: string;
} {
  if (!hasCache || cacheAgeMs === null) {
    return { dataFreshness: "unknown", dataFreshnessLabel: "Unknown" };
  }
  if (cacheAgeMs <= WARNING_AFTER_MS) {
    return { dataFreshness: "current", dataFreshnessLabel: "Current" };
  }
  return {
    dataFreshness: "stale",
    dataFreshnessLabel: `Stale · ${formatRelativeAge(cacheAgeMs)}`,
  };
}

function resolveSeverity(input: {
  tokenMissing: boolean;
  hasCache: boolean;
  cacheAgeMs: number | null;
  liveFailed: boolean;
  partialSync: boolean;
}): { severity: AtsHealthSeverity; statusLabel: string } {
  if (input.tokenMissing && !input.hasCache) {
    return { severity: "offline", statusLabel: "ATS Offline — configuration required" };
  }
  if (!input.hasCache && input.liveFailed) {
    return { severity: "offline", statusLabel: "ATS Offline — no cached data" };
  }
  if (input.hasCache && input.liveFailed) {
    return { severity: "degraded", statusLabel: "ATS Degraded — serving cached data" };
  }
  if (input.partialSync || (input.cacheAgeMs !== null && input.cacheAgeMs > STALE_AFTER_MS)) {
    return { severity: "warning", statusLabel: "ATS Warning — data may be incomplete" };
  }
  if (input.cacheAgeMs !== null && input.cacheAgeMs > WARNING_AFTER_MS) {
    return { severity: "warning", statusLabel: "ATS Warning — cache aging" };
  }
  return { severity: "healthy", statusLabel: "ATS Status: Healthy" };
}

export async function buildAtsHealthSnapshot(): Promise<AtsHealthSnapshot> {
  const started = Date.now();
  const generatedAt = new Date().toISOString();

  try {
    const sync = await buildBreezySyncHealthSnapshot();
    const syncDurationMs = Date.now() - started;
    lastSyncDurationMs = syncDurationMs;

    const jobsCached = sync.jobSync.publishedCount + sync.jobSync.draftCount;
    const candidatesCached = sync.candidateSync.candidateCount;
    const hasCache = jobsCached > 0 || candidatesCached > 0;
    const cacheFetchedAt = sync.candidateSync.fetchedAt ?? sync.jobSync.fetchedAt ?? sync.lastSyncTime;
    const cacheAgeMs = cacheFetchedAt
      ? Math.max(0, Date.now() - new Date(cacheFetchedAt).getTime())
      : null;

    const liveFailed = sync.syncStatus === "failed" || sync.failedJobs > 0;
    const partialSync = sync.candidateSync.truncated || sync.syncStatus === "warning";

    if (sync.lastSyncTime && hasCache) {
      recordAtsSyncSuccess(syncDurationMs, sync.lastSyncTime);
    } else if (liveFailed && !hasCache) {
      recordAtsSyncFailure(sync.statusLabel);
    }

    const { severity, statusLabel } = resolveSeverity({
      tokenMissing: sync.tokenStatus === "missing",
      hasCache,
      cacheAgeMs,
      liveFailed,
      partialSync,
    });
    const { dataFreshness, dataFreshnessLabel } = resolveDataFreshness(cacheAgeMs, hasCache);

    const notes = [
      ...sync.notes,
      hasCache && liveFailed
        ? "Live Breezy refresh failed — dashboards continue on last successful cache."
        : null,
      partialSync ? "Candidate sync is partial; background retry recommended." : null,
    ].filter((note): note is string => Boolean(note));

    return {
      ok: true,
      generatedAt,
      severity,
      statusLabel,
      lastSuccessfulSync: lastSuccessfulSync ?? sync.lastSyncTime,
      lastFailedSync: lastFailedSync,
      lastFailureMessage,
      jobsCached,
      candidatesCached,
      syncDurationMs: lastSyncDurationMs,
      consecutiveFailures,
      cacheAgeMs,
      dataFreshness,
      dataFreshnessLabel,
      notes,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "ATS health check failed";
    recordAtsSyncFailure(message);
    return {
      ok: true,
      generatedAt,
      severity: consecutiveFailures >= 3 ? "offline" : "degraded",
      statusLabel: "ATS health check failed",
      lastSuccessfulSync,
      lastFailedSync,
      lastFailureMessage: message,
      jobsCached: 0,
      candidatesCached: 0,
      syncDurationMs: Date.now() - started,
      consecutiveFailures,
      cacheAgeMs: null,
      dataFreshness: "unknown",
      dataFreshnessLabel: "Unknown",
      notes: [message],
    };
  }
}
