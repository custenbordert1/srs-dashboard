"use client";

import { fetchJsonWithRetry } from "@/hooks/use-fetch-with-retry";
import { cacheKey, invalidateCached, LONG_CLIENT_CACHE_TTL_MS } from "@/lib/client-api-cache";
import { buildDataTrustState, dataTrustStatusMessage, type DataTrustState } from "@/lib/data-trust-state";
import { FETCH_T3_TERRITORY_MS } from "@/lib/fetch-with-timeout";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const DEFAULT_POLL_MS = 90_000;

export type DashboardMeta = {
  partialSync?: boolean;
  scanMode?: string;
  positionsScanned?: number;
  totalPositionsAvailable?: number;
  filteredJobs?: number;
  filteredCandidates?: number;
  refreshedAt?: string;
};

type UseTerritoryDashboardOptions = {
  endpoint?: string;
  /** Scopes client cache per user/session so switching DM accounts does not reuse another territory. */
  cacheScope?: string;
  pollIntervalMs?: number;
  timeoutMs?: number;
  enabled?: boolean;
};

type DashboardResponse<T> = {
  ok: boolean;
  error?: string;
  dashboard?: T;
  meta?: DashboardMeta;
};

type FetchMode = "initial" | "background" | "manual";

export function useTerritoryDashboard<T>(options: UseTerritoryDashboardOptions = {}) {
  const {
    endpoint = "/api/dm/dashboard",
    cacheScope = "",
    pollIntervalMs = DEFAULT_POLL_MS,
    timeoutMs = FETCH_T3_TERRITORY_MS,
    enabled = true,
  } = options;

  const dashboardCacheKey = cacheKey(["dashboard", endpoint, cacheScope]);

  const [data, setData] = useState<T | null>(null);
  const [meta, setMeta] = useState<DashboardMeta>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  const initialLoadDone = useRef(false);
  const fetchGeneration = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  const runFetch = useCallback(
    async (mode: FetchMode, forceRefresh = false) => {
      if (!enabled) return;

      const generation = fetchGeneration.current + 1;
      fetchGeneration.current = generation;

      if (mode !== "background") {
        abortRef.current?.abort();
      }
      const controller = new AbortController();
      if (mode !== "background") {
        abortRef.current = controller;
      }

      const showRefreshing = mode === "manual";
      const showLoading = mode === "initial" && !initialLoadDone.current;

      if (showRefreshing) setRefreshing(true);
      if (showLoading) setLoading(true);
      if (mode === "manual") setTimedOut(false);
      if (mode !== "background") setError(null);

      try {
        const result = await fetchJsonWithRetry<DashboardResponse<T>>(endpoint, undefined, {
          cacheKey: dashboardCacheKey,
          cacheTtlMs: forceRefresh ? 0 : LONG_CLIENT_CACHE_TTL_MS,
          force: forceRefresh,
          timeoutMs,
          signal: controller.signal,
        });

        if (!mountedRef.current || generation !== fetchGeneration.current) return;

        if (!result.ok) {
          if (result.aborted || result.suppressError) {
            setError(null);
            return;
          }
          if (mode === "background" && initialLoadDone.current) return;
          if (result.timedOut) {
            setTimedOut(true);
            setError(
              result.error ??
                dataTrustStatusMessage("degraded", { timedOut: true }),
            );
          } else if (result.error) {
            setError(result.error);
            if (mode === "initial") setData(null);
          }
          return;
        }

        const parsed = result.data;
        if (!parsed.ok || !parsed.dashboard) {
          setError(parsed.error ?? "Failed to load dashboard");
          if (mode === "initial") setData(null);
          return;
        }

        setData(parsed.dashboard);
        setMeta(parsed.meta);
        setTimedOut(false);
        setError(null);
        initialLoadDone.current = true;
      } finally {
        if (!mountedRef.current || generation !== fetchGeneration.current) return;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [dashboardCacheKey, enabled, endpoint, timeoutMs],
  );

  const refresh = useCallback(() => {
    invalidateCached(dashboardCacheKey);
    void runFetch("manual", true);
  }, [dashboardCacheKey, runFetch]);

  useEffect(() => {
    mountedRef.current = true;

    if (!enabled) {
      queueMicrotask(() => {
        if (mountedRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      });
      return () => {
        mountedRef.current = false;
        abortRef.current?.abort();
      };
    }

    queueMicrotask(() => {
      if (mountedRef.current) void runFetch("initial", false);
    });

    const interval =
      pollIntervalMs > 0
        ? window.setInterval(() => {
            if (!initialLoadDone.current) return;
            void runFetch("background", false);
          }, pollIntervalMs)
        : undefined;

    return () => {
      mountedRef.current = false;
      fetchGeneration.current += 1;
      abortRef.current?.abort();
      if (interval !== undefined) window.clearInterval(interval);
    };
  }, [enabled, pollIntervalMs, runFetch]);

  const dataTrust = useMemo((): DataTrustState => {
    return buildDataTrustState({
      loading,
      refreshing,
      error,
      timedOut,
      hasData: Boolean(data),
      partialSync: meta?.partialSync,
      scanMode: meta?.scanMode,
      positionsScanned: meta?.positionsScanned,
      totalPositionsAvailable: meta?.totalPositionsAvailable,
    });
  }, [data, error, loading, meta, refreshing, timedOut]);

  const statusMessage = useMemo(() => {
    if (refreshing) return "Refreshing…";
    if (loading && !data) return "Syncing…";
    return dataTrustStatusMessage(dataTrust, {
      error,
      timedOut,
      positionsScanned: meta?.positionsScanned,
      totalPositionsAvailable: meta?.totalPositionsAvailable,
    });
  }, [data, dataTrust, error, loading, meta, refreshing, timedOut]);

  return { data, meta, error, loading, refreshing, timedOut, refresh, dataTrust, statusMessage };
}
