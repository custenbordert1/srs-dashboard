"use client";

import { cacheKey, fetchCachedJson, invalidateCached, LONG_CLIENT_CACHE_TTL_MS } from "@/lib/client-api-cache";
import type { RepIntelligenceSnapshot } from "@/lib/rep-intelligence/rep-types";
import { fetchWithTimeout, HEAVY_REQUEST_TIMEOUT_MS, isTimeoutError } from "@/lib/fetch-with-timeout";
import { useCallback, useEffect, useRef, useState } from "react";

type UseRepIntelligenceOptions = {
  enabled?: boolean;
  includeInactive?: boolean;
};

async function fetchRepIntelligence(
  signal?: AbortSignal,
  includeInactive = false,
): Promise<RepIntelligenceSnapshot> {
  const query = includeInactive ? "?includeInactive=true" : "";
  const res = await fetchWithTimeout(`/api/rep-intelligence${query}`, {
    cache: "no-store",
    timeoutMs: HEAVY_REQUEST_TIMEOUT_MS,
    signal,
  });
  const parsed = (await res.json()) as {
    ok?: boolean;
    snapshot?: RepIntelligenceSnapshot;
    error?: string;
  };
  if (!parsed.ok || !parsed.snapshot) {
    throw new Error(parsed.error ?? "Unable to load rep intelligence");
  }
  return parsed.snapshot;
}

export function useRepIntelligence(options: UseRepIntelligenceOptions = {}) {
  const enabled = options.enabled ?? true;
  const includeInactive = options.includeInactive ?? false;
  const [snapshot, setSnapshot] = useState<RepIntelligenceSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);

  const fetchGeneration = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  const load = useCallback(
    async (force = false) => {
      if (!enabled) return;

      const generation = fetchGeneration.current + 1;
      fetchGeneration.current = generation;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setError(null);
      setTimedOut(false);

      try {
        const data = await fetchCachedJson(
          cacheKey(["rep-intelligence", includeInactive ? "all" : "active"]),
          () => fetchRepIntelligence(controller.signal, includeInactive),
          {
            ttlMs: LONG_CLIENT_CACHE_TTL_MS,
            force,
            label: "rep-intelligence",
          },
        );
        if (!mountedRef.current || generation !== fetchGeneration.current) return;
        setSnapshot(data);
      } catch (err) {
        if (!mountedRef.current || generation !== fetchGeneration.current) return;
        if (isTimeoutError(err)) {
          setTimedOut(true);
          setError("Workforce intelligence request timed out. Try again.");
        } else {
          setError(err instanceof Error ? err.message : "Unable to load rep intelligence");
        }
      } finally {
        if (!mountedRef.current || generation !== fetchGeneration.current) return;
        setLoading(false);
      }
    },
    [enabled, includeInactive],
  );

  const refresh = useCallback(() => {
    invalidateCached("rep-intelligence");
    void load(true);
  }, [load]);

  useEffect(() => {
    mountedRef.current = true;
    if (!enabled) {
      queueMicrotask(() => {
        if (mountedRef.current) setLoading(false);
      });
      return () => {
        mountedRef.current = false;
        abortRef.current?.abort();
      };
    }

    queueMicrotask(() => {
      if (mountedRef.current) void load(false);
    });

    return () => {
      mountedRef.current = false;
      fetchGeneration.current += 1;
      abortRef.current?.abort();
    };
  }, [enabled, load]);

  return { snapshot, loading, error, timedOut, refresh };
}
