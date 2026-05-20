"use client";

export type FetchRetryOptions = {
  maxAttempts?: number;
  baseDelayMs?: number;
  isRetryable?: (status: number, body: unknown) => boolean;
};

const DEFAULT_RETRYABLE = (status: number, body: unknown) => {
  if (status === 429 || status === 502 || status === 503) return true;
  if (body && typeof body === "object" && "error" in body) {
    const message = String((body as { error?: string }).error ?? "").toLowerCase();
    return message.includes("rate limit") || message.includes("downtime");
  }
  return false;
};

export async function fetchJsonWithRetry<T>(
  url: string,
  init?: RequestInit,
  options: FetchRetryOptions = {},
): Promise<{ ok: true; data: T; status: number } | { ok: false; error: string; status: number }> {
  const maxAttempts = options.maxAttempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 1200;
  const isRetryable = options.isRetryable ?? DEFAULT_RETRYABLE;

  let lastError = "Request failed";
  let lastStatus = 0;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const res = await fetch(url, { cache: "no-store", ...init });
      lastStatus = res.status;
      const parsed = (await res.json()) as T;
      if (res.ok) return { ok: true, data: parsed, status: res.status };
      lastError =
        parsed && typeof parsed === "object" && "error" in parsed
          ? String((parsed as { error?: string }).error)
          : `HTTP ${res.status}`;
      if (!isRetryable(res.status, parsed) || attempt === maxAttempts - 1) {
        return { ok: false, error: lastError, status: res.status };
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : "Network error";
      if (attempt === maxAttempts - 1) return { ok: false, error: lastError, status: lastStatus };
    }
    await new Promise((resolve) => setTimeout(resolve, baseDelayMs * (attempt + 1)));
  }

  return { ok: false, error: lastError, status: lastStatus };
}
