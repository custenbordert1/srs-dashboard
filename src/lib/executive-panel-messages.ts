import { isAbortError, isTimeoutError } from "@/lib/fetch-with-timeout";
import {
  friendlyFetchMessageFromError,
  isIgnorableFetchError,
  sanitizeFriendlyFetchMessage,
} from "@/lib/friendly-fetch-errors";

export type ExecutivePanelKind = "forecast" | "accountability";

export { isIgnorableFetchError, sanitizeFriendlyFetchMessage };

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
  const context = kind === "forecast" ? "forecast" : "accountability";

  const friendly =
    friendlyFetchMessageFromError(err, context) ??
    sanitizeFriendlyFetchMessage(null, context, { timedOut }) ??
    (kind === "forecast" ? "Unable to generate forecast. Retry." : "Unable to load accountability data. Retry.");

  return {
    message: friendly,
    timedOut,
    canRetry: true,
  };
}
