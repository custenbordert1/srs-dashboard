"use client";

import { fetchJsonWithRetry } from "@/hooks/use-fetch-with-retry";
import { cacheKey, invalidateCached, LONG_CLIENT_CACHE_TTL_MS } from "@/lib/client-api-cache";
import { DASHBOARD_REQUEST_TIMEOUT_MS } from "@/lib/fetch-with-timeout";
import { friendlyFetchMessageFromError, sanitizeFriendlyFetchMessage } from "@/lib/friendly-fetch-errors";
import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_POLL_MS = 90_000;

type DashboardMeta = {
  partialSync?: boolean;
  filteredJobs?: number;
  filteredCandidates?: number;
  refreshedAt?: string;
  candidatesFromCache?: boolean;
  candidatesUnavailable?: boolean;
  jobsAvailable?: boolean;
  totalJobs?: number;
  totalCandidates?: number;
};

type UseTerritoryDashboardOptions = {
  endpoint?: string;
  pollIntervalMs?: number;
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
    pollIntervalMs = DEFAULT_POLL_MS,
    enabled = true,
  } = options;

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

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const showRefreshing = mode === "manual";
      const showLoading = mode === "initial" && !initialLoadDone.current;

      if (showRefreshing) setRefreshing(true);
      if (showLoading) setLoading(true);
      if (mode === "manual") setTimedOut(false);
      if (mode !== "background") setError(null);

      try {
        const result = await fetchJsonWithRetry<DashboardResponse<T>>(endpoint, undefined, {
          cacheKey: cacheKey(["dashboard", endpoint]),
          cacheTtlMs: forceRefresh ? 0 : LONG_CLIENT_CACHE_TTL_MS,
          force: forceRefresh,
          timeoutMs: DASHBOARD_REQUEST_TIMEOUT_MS,
          signal: controller.signal,
        });

        if (!mountedRef.current || generation !== fetchGeneration.current) return;

        if (!result.ok) {
          if (result.aborted) return;
          if (mode === "background" && initialLoadDone.current) return;
          if (result.timedOut) {
            setTimedOut(true);
            setError(
              sanitizeFriendlyFetchMessage(result.error, "dashboard", { timedOut: true }) ??
                "Dashboard sync is taking longer than expected. Retry shortly.",
            );
          } else {
            setError(
              sanitizeFriendlyFetchMessage(result.error, "dashboard") ??
                "Dashboard data temporarily unavailable. Retry shortly.",
            );
            if (mode === "initial") setData(null);
          }
          return;
        }

        const parsed = result.data;
        if (!parsed.ok || !parsed.dashboard) {
          setError(
            sanitizeFriendlyFetchMessage(parsed.error, "dashboard") ??
              "Dashboard data temporarily unavailable. Retry shortly.",
          );
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
    [enabled, endpoint],
  );

  const refresh = useCallback(() => {
    invalidateCached(cacheKey(["dashboard", endpoint]));
    void runFetch("manual", true);
  }, [endpoint, runFetch]);

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
            if (typeof document !== "undefined" && document.hidden) return;
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

  return { data, meta, error, loading, refreshing, timedOut, refresh };
}
