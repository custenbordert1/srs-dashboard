"use client";

import { cacheKey, fetchCachedJson, invalidateCached, LONG_CLIENT_CACHE_TTL_MS } from "@/lib/client-api-cache";
import type { CoverageRiskSnapshot } from "@/lib/coverage-risk-engine";
import { fetchWithTimeout, FETCH_T4_INTELLIGENCE_MS, isTimeoutError } from "@/lib/fetch-with-timeout";
import { useCallback, useEffect, useRef, useState } from "react";

type UseCoverageRiskOptions = {
  enabled?: boolean;
};

async function fetchCoverageRisk(signal?: AbortSignal): Promise<CoverageRiskSnapshot> {
  const res = await fetchWithTimeout("/api/coverage-risk", {
    cache: "no-store",
    timeoutMs: FETCH_T4_INTELLIGENCE_MS,
    signal,
  });
  const parsed = (await res.json()) as {
    ok?: boolean;
    snapshot?: CoverageRiskSnapshot;
    error?: string;
  };
  if (!parsed.ok || !parsed.snapshot) {
    throw new Error(parsed.error ?? "Unable to load coverage risk intelligence");
  }
  return parsed.snapshot;
}

export function useCoverageRisk(options: UseCoverageRiskOptions = {}) {
  const enabled = options.enabled ?? true;
  const [snapshot, setSnapshot] = useState<CoverageRiskSnapshot | null>(null);
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
          cacheKey(["coverage-risk"]),
          () => fetchCoverageRisk(controller.signal),
          {
            ttlMs: LONG_CLIENT_CACHE_TTL_MS,
            force,
            label: "coverage-risk",
          },
        );
        if (!mountedRef.current || generation !== fetchGeneration.current) return;
        setSnapshot(data);
      } catch (err) {
        if (!mountedRef.current || generation !== fetchGeneration.current) return;
        if (isTimeoutError(err)) {
          setTimedOut(true);
          setError("Coverage risk request timed out. Try again.");
        } else {
          setError(err instanceof Error ? err.message : "Unable to load coverage risk intelligence");
        }
      } finally {
        if (!mountedRef.current || generation !== fetchGeneration.current) return;
        setLoading(false);
      }
    },
    [enabled],
  );

  const refresh = useCallback(() => {
    invalidateCached(cacheKey(["coverage-risk"]));
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
