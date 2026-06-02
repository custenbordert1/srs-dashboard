import { timeoutErrorMessage } from "@/lib/fetch-with-timeout";

export type FetchAbortContext = "refresh" | "navigation" | "superseded";

/** User-facing message for aborted fetches; null means suppress UI error. */
export function fetchAbortedMessage(context: FetchAbortContext = "superseded"): string | null {
  switch (context) {
    case "refresh":
      return null;
    case "navigation":
      return null;
    case "superseded":
    default:
      return null;
  }
}

export function fetchTimeoutMessage(label: string, timeoutMs: number): string {
  return timeoutErrorMessage(label, timeoutMs);
}

export function fetchRefreshingLabel(): string {
  return "Refreshing…";
}

export function fetchSyncingLabel(): string {
  return "Syncing…";
}
