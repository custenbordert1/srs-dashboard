"use client";

import {
  cacheKey,
  DEFAULT_CLIENT_CACHE_TTL_MS,
  fetchCachedJson,
} from "@/lib/client-api-cache";

export type FetchRetryOptions = {
  maxAttempts?: number;
  baseDelayMs?: number;
  isRetryable?: (status: number, body: unknown) => boolean;
  /** Client cache TTL; set 0 to disable cache for this request */
  cacheTtlMs?: number;
  cacheKey?: string;
  force?: boolean;
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
  const ttlMs = options.cacheTtlMs ?? DEFAULT_CLIENT_CACHE_TTL_MS;
  const key = options.cacheKey ?? cacheKey(["fetch", url, init?.method ?? "GET"]);

  if (ttlMs > 0 && !options.force) {
    try {
      const cached = await fetchCachedJson<T>(
        key,
        async () => {
          const result = await fetchJsonWithRetryUncached<T>(url, init, {
            maxAttempts,
            baseDelayMs,
            isRetryable,
          });
          if (!result.ok) throw new Error(result.error);
          return result.data;
        },
        { ttlMs, label: url },
      );
      return { ok: true, data: cached, status: 200 };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Request failed",
        status: 0,
      };
    }
  }

  return fetchJsonWithRetryUncached<T>(url, init, { maxAttempts, baseDelayMs, isRetryable });
}

async function fetchJsonWithRetryUncached<T>(
  url: string,
  init?: RequestInit,
  options: {
    maxAttempts: number;
    baseDelayMs: number;
    isRetryable: (status: number, body: unknown) => boolean;
  } = { maxAttempts: 3, baseDelayMs: 1200, isRetryable: DEFAULT_RETRYABLE },
): Promise<{ ok: true; data: T; status: number } | { ok: false; error: string; status: number }> {
  let lastError = "Request failed";
  let lastStatus = 0;

  for (let attempt = 0; attempt < options.maxAttempts; attempt += 1) {
    try {
      const res = await fetch(url, { cache: "no-store", ...init });
      lastStatus = res.status;
      const parsed = (await res.json()) as T;
      if (res.ok) return { ok: true, data: parsed, status: res.status };
      lastError =
        parsed && typeof parsed === "object" && "error" in parsed
          ? String((parsed as { error?: string }).error)
          : `HTTP ${res.status}`;
      if (!options.isRetryable(res.status, parsed) || attempt === options.maxAttempts - 1) {
        return { ok: false, error: lastError, status: res.status };
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : "Network error";
      if (attempt === options.maxAttempts - 1) return { ok: false, error: lastError, status: lastStatus };
    }
    await new Promise((resolve) => setTimeout(resolve, options.baseDelayMs * (attempt + 1)));
  }

  return { ok: false, error: lastError, status: lastStatus };
}
