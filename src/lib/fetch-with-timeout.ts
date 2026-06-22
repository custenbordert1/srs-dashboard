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
  if (err instanceof Error && /abort/i.test(err.message)) return true;
  return false;
}

export function isTimeoutError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === "TimeoutError") return true;
  if (err instanceof Error && err.message.toLowerCase().includes("timed out")) return true;
  return false;
}

export const DASHBOARD_REQUEST_TIMEOUT_MS = 10_000;
export const HEAVY_REQUEST_TIMEOUT_MS = 30_000;
/** Breezy jobs list — single GET, fits 10s budget. */
export const BREEZY_CLIENT_REQUEST_TIMEOUT_MS = DASHBOARD_REQUEST_TIMEOUT_MS;
/** Breezy preview-tier candidate sync — server budget ~18s + jobs list. */
export const BREEZY_CANDIDATES_PREVIEW_CLIENT_TIMEOUT_MS = HEAVY_REQUEST_TIMEOUT_MS;

export function timeoutErrorMessage(label: string, timeoutMs: number): string {
  const seconds = Math.round(timeoutMs / 1000);
  return `${label} timed out after ${seconds}s. Breezy may still be syncing — switch tabs and retry shortly.`;
}
