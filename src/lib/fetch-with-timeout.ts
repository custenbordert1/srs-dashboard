const DEFAULT_TIMEOUT_MS = 10_000;

function combineSignals(signals: AbortSignal[]): AbortSignal {
  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any(signals);
  }
  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      return controller.signal;
    }
    signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true });
  }
  return controller.signal;
}

export type FetchWithTimeoutInit = RequestInit & {
  timeoutMs?: number;
};

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: FetchWithTimeoutInit = {},
): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal: externalSignal, ...rest } = init;
  const timeoutController = new AbortController();
  const signals = [timeoutController.signal];
  if (externalSignal) signals.push(externalSignal);
  const signal = combineSignals(signals);

  const timeoutId = window.setTimeout(() => {
    timeoutController.abort(new DOMException("Request timed out", "TimeoutError"));
  }, timeoutMs);

  try {
    return await fetch(input, { ...rest, cache: rest.cache ?? "no-store", signal });
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export function isAbortError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === "AbortError") return true;
  if (err instanceof DOMException && err.name === "TimeoutError") return true;
  if (err instanceof Error && err.name === "AbortError") return true;
  return false;
}

export function isTimeoutError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === "TimeoutError") return true;
  if (err instanceof Error && err.message.toLowerCase().includes("timed out")) return true;
  return false;
}

/** T1 — instant reads (workflows, session, default fetch). Server routes typically ≤30s. */
export const FETCH_T1_INSTANT_MS = 10_000;
/** T2 — sheet / single GET (jobs list, workforce meta). */
export const FETCH_T2_SHEET_MS = 15_000;
/** T3 — territory dashboards (DM, executive). Aligns with server maxDuration 120s. */
export const FETCH_T3_TERRITORY_MS = 110_000;
/** T4 — intelligence bundles (recruiting intelligence, coverage-risk). */
export const FETCH_T4_INTELLIGENCE_MS = 110_000;
/** T5 — Breezy candidate scan tiers (fast / full). */
export const FETCH_T5_BREEZY_SCAN_MS = 125_000;
/** Preview scan server budget ~18s — client margin without matching full T5. */
export const FETCH_T5_BREEZY_PREVIEW_MS = 30_000;

/** @deprecated Use FETCH_T1_INSTANT_MS */
export const DASHBOARD_REQUEST_TIMEOUT_MS = FETCH_T1_INSTANT_MS;
/** @deprecated Use FETCH_T4_INTELLIGENCE_MS */
export const HEAVY_REQUEST_TIMEOUT_MS = FETCH_T4_INTELLIGENCE_MS;
/** @deprecated Use FETCH_T4_INTELLIGENCE_MS */
export const ROUTING_INTELLIGENCE_CLIENT_TIMEOUT_MS = FETCH_T4_INTELLIGENCE_MS;
/** @deprecated Use FETCH_T3_TERRITORY_MS */
export const TERRITORY_DASHBOARD_TIMEOUT_MS = FETCH_T3_TERRITORY_MS;
/** @deprecated Use FETCH_T1_INSTANT_MS */
export const BREEZY_CLIENT_REQUEST_TIMEOUT_MS = FETCH_T1_INSTANT_MS;
/** @deprecated Use FETCH_T5_BREEZY_PREVIEW_MS */
export const BREEZY_CANDIDATES_PREVIEW_CLIENT_TIMEOUT_MS = FETCH_T5_BREEZY_PREVIEW_MS;
/** @deprecated Use FETCH_T5_BREEZY_SCAN_MS */
export const BREEZY_CANDIDATES_FAST_CLIENT_TIMEOUT_MS = FETCH_T5_BREEZY_SCAN_MS;
/** @deprecated Use FETCH_T5_BREEZY_SCAN_MS */
export const BREEZY_CANDIDATES_FULL_HYDRATION_TIMEOUT_MS = FETCH_T5_BREEZY_SCAN_MS;

export function timeoutErrorMessage(label: string, timeoutMs: number): string {
  const seconds = Math.round(timeoutMs / 1000);
  return `${label} timed out after ${seconds}s. Breezy may still be syncing — switch tabs and retry shortly.`;
}
