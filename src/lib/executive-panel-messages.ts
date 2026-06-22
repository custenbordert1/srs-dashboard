import { isAbortError, isTimeoutError } from "@/lib/fetch-with-timeout";

export type ExecutivePanelKind = "forecast" | "accountability";

export function isIgnorableFetchError(err: unknown): boolean {
  if (isAbortError(err)) return true;
  if (err instanceof Error && /abort/i.test(err.message)) return true;
  return false;
}

export function executivePanelErrorMessage(
  kind: ExecutivePanelKind,
  err: unknown,
  options?: { showingCachedSnapshot?: boolean },
): { message: string; timedOut: boolean; canRetry: boolean } {
  if (options?.showingCachedSnapshot) {
    if (kind === "forecast") {
      return {
        message: "Forecast data temporarily unavailable. Showing most recent cached snapshot.",
        timedOut: false,
        canRetry: true,
      };
    }
    return {
      message: "Accountability data temporarily unavailable. Showing most recent cached snapshot.",
      timedOut: false,
      canRetry: true,
    };
  }

  const timedOut = isTimeoutError(err);
  if (kind === "forecast") {
    return {
      message: timedOut
        ? "Forecast data temporarily unavailable. Showing most recent cached snapshot."
        : "Unable to generate forecast. Retry.",
      timedOut,
      canRetry: true,
    };
  }

  return {
    message: timedOut
      ? "Accountability data is taking longer than expected. Retry or wait for cache."
      : "Unable to load accountability data. Retry.",
    timedOut,
    canRetry: true,
  };
}
