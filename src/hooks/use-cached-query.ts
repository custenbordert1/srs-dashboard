"use client";

import {
  DEFAULT_CLIENT_CACHE_TTL_MS,
  fetchCachedJson,
  invalidateCached,
} from "@/lib/client-api-cache";
import { useCallback, useEffect, useRef, useState } from "react";

type UseCachedQueryOptions = {
  enabled?: boolean;
  ttlMs?: number;
  cacheKey: string;
};

export function useCachedQuery<T>(
  fetcher: () => Promise<T>,
  options: UseCachedQueryOptions,
) {
  const { enabled = true, ttlMs = DEFAULT_CLIENT_CACHE_TTL_MS, cacheKey } = options;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const load = useCallback(
    async (force = false) => {
      if (!enabled) return;
      setLoading(true);
      setError(null);
      try {
        const result = await fetchCachedJson(cacheKey, fetcher, {
          ttlMs,
          force,
          label: cacheKey,
        });
        if (mounted.current) setData(result);
      } catch (err) {
        if (mounted.current) {
          setError(err instanceof Error ? err.message : "Request failed");
        }
      } finally {
        if (mounted.current) setLoading(false);
      }
    },
    [cacheKey, enabled, fetcher, ttlMs],
  );

  useEffect(() => {
    mounted.current = true;
    if (!enabled) {
      return () => {
        mounted.current = false;
      };
    }
    queueMicrotask(() => {
      if (mounted.current) void load(false);
    });
    return () => {
      mounted.current = false;
    };
  }, [enabled, load]);

  const refresh = useCallback(() => {
    invalidateCached(cacheKey);
    void load(true);
  }, [cacheKey, load]);

  return { data, loading, error, refresh, setData };
}
