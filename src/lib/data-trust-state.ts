/**
 * Shared data freshness / completeness model for recruiting dashboards.
 */

export type DataTrustState =
  | "live"
  | "partial"
  | "cached"
  | "loading"
  | "degraded"
  | "unavailable";

export type DataTrustInput = {
  loading?: boolean;
  refreshing?: boolean;
  error?: string | null;
  timedOut?: boolean;
  hasData?: boolean;
  partialSync?: boolean;
  truncated?: boolean;
  scanMode?: string | null;
  positionsScanned?: number;
  totalPositionsAvailable?: number;
  fromCache?: boolean;
  stale?: boolean;
};

export const DATA_TRUST_LABELS: Record<DataTrustState, string> = {
  live: "Live",
  partial: "Partial sync",
  cached: "Cached",
  loading: "Syncing…",
  degraded: "Showing last sync",
  unavailable: "Unavailable",
};

export function isIncompletePositionScan(input: DataTrustInput): boolean {
  if (input.partialSync || input.truncated) return true;
  const total = input.totalPositionsAvailable ?? 0;
  const scanned = input.positionsScanned ?? 0;
  if (total > 0 && scanned > 0 && scanned < total) return true;
  const mode = (input.scanMode ?? "").toLowerCase();
  if (mode === "preview" || mode === "fast") {
    if (total > 0 && scanned < total) return true;
    if (mode === "preview") return true;
  }
  return false;
}

/** Single source of truth for dashboard data trust. */
export function buildDataTrustState(input: DataTrustInput): DataTrustState {
  const hasData = Boolean(input.hasData);

  if (!hasData) {
    if (input.loading || input.refreshing) return "loading";
    if (input.error || input.timedOut) return "unavailable";
    return "loading";
  }

  if (input.loading && !input.refreshing) {
    return "loading";
  }

  if (input.refreshing) {
    return "loading";
  }

  if (input.error || input.timedOut || input.stale) {
    return "degraded";
  }

  if (isIncompletePositionScan(input)) {
    return "partial";
  }

  if (input.fromCache) {
    return "cached";
  }

  return "live";
}

export function dataTrustStatusMessage(
  state: DataTrustState,
  options?: {
    error?: string | null;
    timedOut?: boolean;
    positionsScanned?: number;
    totalPositionsAvailable?: number;
  },
): string {
  switch (state) {
    case "loading":
      return "Syncing…";
    case "degraded":
      if (options?.timedOut) {
        return "Timed out — showing last successful sync. Retry when ready.";
      }
      if (options?.error) return options.error;
      return "Showing last successful sync while live refresh completes.";
    case "partial": {
      const scanned = options?.positionsScanned;
      const total = options?.totalPositionsAvailable;
      if (scanned != null && total != null && total > 0) {
        return `Partial Breezy sync — ${scanned} of ${total} positions scanned. KPIs may update as sync completes.`;
      }
      return "Partial Breezy sync — some positions may not be included in counts yet.";
    }
    case "cached":
      return "Loaded from recent cache.";
    case "unavailable":
      return options?.error ?? "Data unavailable.";
    case "live":
    default:
      return "Live data from the latest successful sync.";
  }
}

export function dataTrustTone(state: DataTrustState): "neutral" | "good" | "warn" | "error" {
  switch (state) {
    case "live":
      return "good";
    case "cached":
      return "neutral";
    case "loading":
      return "neutral";
    case "partial":
    case "degraded":
      return "warn";
    case "unavailable":
      return "error";
    default:
      return "neutral";
  }
}
