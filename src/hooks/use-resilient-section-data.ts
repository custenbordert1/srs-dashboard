"use client";

import { LONG_CLIENT_CACHE_TTL_MS } from "@/lib/client-api-cache";
import {
  P161_CLIENT_HEAVY_FETCH_TIMEOUT_MS,
  P161_CLIENT_SECTION_TIMEOUT_MS,
  P161_EXECUTIVE_LOADING_CEILING_MS,
} from "@/lib/app-loading-reliability/constants";
import { buildDegradedWarning } from "@/lib/app-loading-reliability/degraded-mode";
import { readStaleCache, writeStaleCache } from "@/lib/app-loading-reliability/stale-cache";
import { friendlyFetchMessageFromError, isIgnorableFetchError } from "@/lib/friendly-fetch-errors";
import { fetchWithTimeout, isTimeoutError, timeoutErrorMessage } from "@/lib/fetch-with-timeout";
import { EXECUTIVE_PANEL_LOADING_CEILING_MS, useLoadingCeiling } from "@/hooks/use-loading-ceiling";
import { useCallback, useEffect, useRef, useState } from "react";

export type ResilientSectionState<T> = {
  data: T | null;
  isLoading: boolean;
  isStale: boolean;
  warning: string | null;
  error: string | null;
  loadingCeilingHit: boolean;
  lastSuccessAt: string | null;
  retry: () => Promise<void>;
};

export function useResilientSectionData<T>(options: {
  cacheKey: string;
  url: string;
  parse: (json: unknown) => T;
  enabled?: boolean;
  timeoutMs?: number;
  fetchTimeoutMs?: number;
  loadingCeilingMs?: number;
  cacheTtlMs?: number;
  label?: string;
}): ResilientSectionState<T> {
  const {
    cacheKey,
    url,
    parse,
    enabled = true,
    timeoutMs = P161_CLIENT_SECTION_TIMEOUT_MS,
    fetchTimeoutMs = P161_CLIENT_HEAVY_FETCH_TIMEOUT_MS,
    loadingCeilingMs = P161_EXECUTIVE_LOADING_CEILING_MS,
    cacheTtlMs = LONG_CLIENT_CACHE_TTL_MS,
    label = "Section",
  } = options;

  const initialEnvelope = typeof window !== "undefined" ? readStaleCache<T>(cacheKey) : null;
  const [data, setData] = useState<T | null>(initialEnvelope?.data ?? null);
  const [isLoading, setIsLoading] = useState(enabled && !initialEnvelope?.data);
  const [isStale, setIsStale] = useState(Boolean(initialEnvelope?.data));
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastSuccessAt, setLastSuccessAt] = useState<string | null>(
    initialEnvelope?.lastSuccessAt ?? null,
  );

  const generationRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadingCeilingHit = useLoadingCeiling(
    isLoading && !data,
    loadingCeilingMs ?? EXECUTIVE_PANEL_LOADING_CEILING_MS,
  );

  const retry = useCallback(async () => {
    if (!enabled) return;

    const generation = ++generationRef.current;
    setIsLoading(true);
    setError(null);
    setWarning(null);

    try {
      const res = await fetchWithTimeout(url, { cache: "no-store", timeoutMs: fetchTimeoutMs });
      const json = (await res.json()) as unknown;
      if (!res.ok) {
        const errBody = json as { error?: string };
        throw new Error(errBody.error ?? `${label} failed (${res.status})`);
      }

      const parsed = parse(json);
      if (!mountedRef.current || generationRef.current !== generation) return;

      const envelope = writeStaleCache(cacheKey, parsed, cacheTtlMs);
      setData(parsed);
      setIsStale(false);
      setLastSuccessAt(envelope.lastSuccessAt);
    } catch (err) {
      if (!mountedRef.current || generationRef.current !== generation) return;
      if (isIgnorableFetchError(err)) return;

      const cached = readStaleCache<T>(cacheKey);
      const degraded = buildDegradedWarning({
        label,
        kind: "error",
        timedOut: isTimeoutError(err),
        detail: isTimeoutError(err)
          ? timeoutErrorMessage(label, fetchTimeoutMs)
          : (friendlyFetchMessageFromError(err, "dashboard") ?? `${label} unavailable`),
      });

      if (cached?.data) {
        setData(cached.data);
        setIsStale(true);
        setLastSuccessAt(cached.lastSuccessAt);
        setWarning(degraded.message);
        setError(degraded.message);
      } else {
        setError(degraded.message);
      }
    } finally {
      if (mountedRef.current && generationRef.current === generation) {
        setIsLoading(false);
      }
    }
  }, [cacheKey, cacheTtlMs, enabled, fetchTimeoutMs, label, parse, timeoutMs, url]);

  useEffect(() => {
    void retry();
  }, [retry]);

  return {
    data,
    isLoading: isLoading && !data && !loadingCeilingHit,
    isStale,
    warning,
    error,
    loadingCeilingHit,
    lastSuccessAt,
    retry,
  };
}
