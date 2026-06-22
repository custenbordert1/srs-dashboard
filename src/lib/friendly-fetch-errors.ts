import { isAbortError, isTimeoutError } from "@/lib/fetch-with-timeout";

export type FriendlyFetchContext =
  | "overview"
  | "candidates"
  | "dashboard"
  | "forecast"
  | "accountability"
  | "ats-health"
  | "pipeline"
  | "generic";

const FRIENDLY_BY_CONTEXT: Record<FriendlyFetchContext, { pending: string; unavailable: string; timeout: string }> = {
  overview: {
    pending: "Breezy overview sync is still running. Retry shortly.",
    unavailable: "Overview data temporarily unavailable. Retry or wait for cache.",
    timeout: "Overview sync is taking longer than expected. Retry shortly.",
  },
  candidates: {
    pending: "Candidate sync pending — table will populate when Breezy cache is ready.",
    unavailable: "Candidate data temporarily unavailable. Retry or wait for cache.",
    timeout: "Candidate sync is taking longer than expected. Showing last loaded data when available.",
  },
  dashboard: {
    pending: "Dashboard sync is still running. Retry shortly.",
    unavailable: "Dashboard data temporarily unavailable. Retry shortly.",
    timeout: "Dashboard sync is taking longer than expected. Retry shortly.",
  },
  forecast: {
    pending: "Forecast data temporarily unavailable. Showing most recent cached snapshot.",
    unavailable: "Unable to generate forecast. Retry.",
    timeout: "Forecast data temporarily unavailable. Showing most recent cached snapshot.",
  },
  accountability: {
    pending: "Accountability data is still loading. Retry shortly.",
    unavailable: "Unable to load accountability data. Retry.",
    timeout: "Accountability data is taking longer than expected. Retry or wait for cache.",
  },
  "ats-health": {
    pending: "ATS health check in progress.",
    unavailable: "ATS health temporarily unavailable. Retry shortly.",
    timeout: "ATS health check timed out. Retry shortly.",
  },
  pipeline: {
    pending: "Pipeline intelligence sync is still running. Retry shortly.",
    unavailable: "Pipeline intelligence temporarily unavailable. Retry shortly.",
    timeout: "Pipeline intelligence is taking longer than expected. Retry in a moment.",
  },
  generic: {
    pending: "Sync pending. Retry shortly.",
    unavailable: "Data temporarily unavailable. Retry shortly.",
    timeout: "Sync is taking longer than expected. Retry shortly.",
  },
};

export function isIgnorableFetchError(err: unknown): boolean {
  if (isAbortError(err)) return true;
  if (err instanceof Error && /abort|cancel/i.test(err.message)) return true;
  return false;
}

function isTechnicalFetchMessage(raw: string): boolean {
  const lower = raw.toLowerCase();
  return (
    lower.includes("signal is") ||
    lower.includes("aborted without reason") ||
    lower.includes("request cancelled") ||
    lower.includes("the operation was aborted") ||
    lower.includes("failed to fetch") ||
    lower.includes("networkerror")
  );
}

export function sanitizeFriendlyFetchMessage(
  raw: string | null | undefined,
  context: FriendlyFetchContext = "generic",
  options?: { timedOut?: boolean; aborted?: boolean },
): string | null {
  const copy = FRIENDLY_BY_CONTEXT[context];

  if (options?.aborted || (raw && isIgnorableFetchError(new Error(raw)))) {
    return null;
  }

  if (options?.timedOut || (raw && isTimeoutError(new Error(raw)))) {
    return copy.timeout;
  }

  if (!raw?.trim()) {
    return copy.unavailable;
  }

  const lower = raw.toLowerCase();
  if (lower.includes("cancel") || lower.includes("abort")) {
    return copy.pending;
  }
  if (lower.includes("timed out") || lower.includes("timeout")) {
    return copy.timeout;
  }
  if (isTechnicalFetchMessage(raw)) {
    return copy.unavailable;
  }

  return raw;
}

export function friendlyFetchMessageFromError(
  err: unknown,
  context: FriendlyFetchContext = "generic",
): string | null {
  if (isIgnorableFetchError(err)) return null;
  const timedOut = isTimeoutError(err);
  const message = err instanceof Error ? err.message : String(err);
  return sanitizeFriendlyFetchMessage(message, context, { timedOut });
}
