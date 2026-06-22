"use client";

import { cacheKey, fetchCachedJson, getCachedAllowExpired, invalidateCached, LONG_CLIENT_CACHE_TTL_MS } from "@/lib/client-api-cache";
import { executivePanelErrorMessage, isIgnorableFetchError } from "@/lib/executive-panel-messages";
import type { ExecutiveRecruitingForecastSnapshot } from "@/lib/executive-recruiting-forecast";
import {
  fetchWithTimeout,
  HEAVY_REQUEST_TIMEOUT_MS,
  isAbortError,
  isTimeoutError,
} from "@/lib/fetch-with-timeout";
import { useCallback, useEffect, useRef, useState } from "react";

const FORECAST_CACHE_KEY = cacheKey(["executive-recruiting-forecast"]);

async function fetchExecutiveRecruitingForecast(signal?: AbortSignal): Promise<ExecutiveRecruitingForecastSnapshot> {
  const res = await fetchWithTimeout("/api/executive-recruiting-forecast", {
    cache: "no-store",
    timeoutMs: HEAVY_REQUEST_TIMEOUT_MS,
    signal,
  });
  const parsed = (await res.json()) as {
    ok?: boolean;
    snapshot?: ExecutiveRecruitingForecastSnapshot;
    error?: string;
  };
  if (!parsed.ok || !parsed.snapshot) {
    throw new Error(parsed.error ?? "Unable to load executive recruiting forecast");
  }
  return parsed.snapshot;
}

export function useExecutiveRecruitingForecast() {
  const [snapshot, setSnapshot] = useState<ExecutiveRecruitingForecastSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [showingCachedSnapshot, setShowingCachedSnapshot] = useState(false);
  const fetchGeneration = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  const load = useCallback(async (force = false) => {
    const generation = fetchGeneration.current + 1;
    fetchGeneration.current = generation;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    setTimedOut(false);
    setShowingCachedSnapshot(false);
    try {
      const data = await fetchCachedJson(
        FORECAST_CACHE_KEY,
        () => fetchExecutiveRecruitingForecast(controller.signal),
        {
          ttlMs: LONG_CLIENT_CACHE_TTL_MS,
          force,
          label: "executive-recruiting-forecast",
          staleOnError: true,
        },
      );
      if (!mountedRef.current || generation !== fetchGeneration.current) return;
      setSnapshot(data);
    } catch (err) {
      if (!mountedRef.current || generation !== fetchGeneration.current) return;
      if (isIgnorableFetchError(err) || isAbortError(err)) return;

      const stale = getCachedAllowExpired<ExecutiveRecruitingForecastSnapshot>(FORECAST_CACHE_KEY);
      if (stale) {
        setSnapshot(stale);
        setShowingCachedSnapshot(true);
        const friendly = executivePanelErrorMessage("forecast", err, {
          showingCachedSnapshot: true,
        });
        setError(friendly.message);
        setTimedOut(friendly.timedOut);
        return;
      }

      const friendly = executivePanelErrorMessage("forecast", err);
      setTimedOut(friendly.timedOut || isTimeoutError(err));
      setError(friendly.message);
    } finally {
      if (!mountedRef.current || generation !== fetchGeneration.current) return;
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(() => {
    invalidateCached(FORECAST_CACHE_KEY);
    void load(true);
  }, [load]);

  useEffect(() => {
    mountedRef.current = true;
    queueMicrotask(() => {
      if (mountedRef.current) void load(false);
    });
    return () => {
      mountedRef.current = false;
      fetchGeneration.current += 1;
      abortRef.current?.abort();
    };
  }, [load]);

  return { snapshot, loading, error, timedOut, showingCachedSnapshot, refresh };
}
