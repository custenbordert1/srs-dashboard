/** Client timeout for Data Health lightweight probes (does not cancel server parity scans). */
export const DATA_HEALTH_REQUEST_TIMEOUT_MS = 15_000;

export type DataHealthTimingLabel = "data-health-load-ms" | "parity-scan-ms" | "breezy-debug-ms";

export function logDataHealthTiming(label: DataHealthTimingLabel, ms: number, detail?: string): void {
  const suffix = detail ? ` — ${detail}` : "";
  console.info(`[${label}] ${Math.round(ms)}ms${suffix}`);
}

export class DataHealthRequestTimeoutError extends Error {
  readonly label: string;
  readonly timeoutMs: number;

  constructor(label: string, timeoutMs: number) {
    super(`${label} timed out after ${timeoutMs}ms`);
    this.name = "DataHealthRequestTimeoutError";
    this.label = label;
    this.timeoutMs = timeoutMs;
  }
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  options?: { timeoutMs?: number; label?: string; init?: RequestInit },
): Promise<Response> {
  const timeoutMs = options?.timeoutMs ?? DATA_HEALTH_REQUEST_TIMEOUT_MS;
  const label = options?.label ?? (typeof input === "string" ? input : "fetch");
  const started = performance.now();
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, { ...options?.init, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new DataHealthRequestTimeoutError(label, timeoutMs);
    }
    throw err;
  } finally {
    window.clearTimeout(timeoutId);
    logDataHealthTiming("data-health-load-ms", performance.now() - started, label);
  }
}

export async function fetchJsonWithTimeout<T>(
  path: string,
  options?: { timeoutMs?: number; label?: string; init?: RequestInit },
): Promise<T> {
  const res = await fetchWithTimeout(path, {
    timeoutMs: options?.timeoutMs,
    label: options?.label ?? path,
    init: { cache: "no-store", ...options?.init },
  });
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error(`${options?.label ?? path} returned HTTP ${res.status} (non-JSON)`);
  }
  return (await res.json()) as T;
}
