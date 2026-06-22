"use client";

import type { RecruitingIntelligenceSnapshot } from "@/lib/recruiting-automation";
import { fetchJsonWithRetry } from "@/hooks/use-fetch-with-retry";
import { cacheKey, invalidateCached, LONG_CLIENT_CACHE_TTL_MS } from "@/lib/client-api-cache";
import { logDashboardFetch } from "@/lib/dashboard-fetch-log";
import { DASHBOARD_REQUEST_TIMEOUT_MS } from "@/lib/fetch-with-timeout";
import { friendlyFetchMessageFromError } from "@/lib/friendly-fetch-errors";
import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_POLL_MS = 90_000;

type IntelligenceMeta = {
  partialSync?: boolean;
  filteredJobs?: number;
  filteredCandidates?: number;
  refreshedAt?: string;
};

type IntelligenceResponse = {
  ok: boolean;
  error?: string;
  intelligence?: RecruitingIntelligenceSnapshot;
  meta?: IntelligenceMeta;
};

type UseRecruitingIntelligenceOptions = {
  pollIntervalMs?: number;
  enabled?: boolean;
};

type FetchMode = "initial" | "background" | "manual";

export function useRecruitingIntelligence(options: UseRecruitingIntelligenceOptions = {}) {
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_MS;
  const enabled = options.enabled ?? true;

  const [data, setData] = useState<RecruitingIntelligenceSnapshot | null>(null);
  const [meta, setMeta] = useState<IntelligenceMeta>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  const initialDone = useRef(false);
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
      const showLoading = mode === "initial" && !initialDone.current;

      if (showRefreshing) setRefreshing(true);
      if (showLoading) setLoading(true);
      if (mode === "manual") setTimedOut(false);
      if (mode !== "background") setError(null);

      const route = "/api/recruiting/intelligence";
      const started = performance.now();
      logDashboardFetch("start", { route, label: "recruiting-intelligence-api" });

      try {
        const result = await fetchJsonWithRetry<IntelligenceResponse>(route, undefined, {
          cacheKey: cacheKey(["recruiting", "intelligence"]),
          cacheTtlMs: forceRefresh ? 0 : LONG_CLIENT_CACHE_TTL_MS,
          force: forceRefresh,
          timeoutMs: DASHBOARD_REQUEST_TIMEOUT_MS,
          maxAttempts: 1,
          signal: controller.signal,
        });

        if (!mountedRef.current || generation !== fetchGeneration.current) return;

        if (!result.ok) {
          if (result.aborted || /cancel/i.test(result.error)) return;
          if (mode === "background" && initialDone.current) return;
          logDashboardFetch(result.timedOut ? "timeout" : "error", {
            route,
            label: "recruiting-intelligence-api",
            ms: Math.round(performance.now() - started),
            error: result.error,
          });
          const friendly =
            friendlyFetchMessageFromError(new Error(result.error), "dashboard") ?? result.error;
          if (result.timedOut) {
            setTimedOut(true);
            setError(friendly);
          } else {
            setError(friendly);
            if (mode === "initial") setData(null);
          }
          return;
        }

        const parsed = result.data;
        if (!parsed.ok || !parsed.intelligence) {
          const message = parsed.error ?? "Failed to load recruiting intelligence";
          logDashboardFetch("error", {
            route,
            label: "recruiting-intelligence-api",
            ms: Math.round(performance.now() - started),
            error: message,
          });
          setError(message);
          if (mode === "initial") setData(null);
          return;
        }

        logDashboardFetch(parsed.meta?.partialSync ? "partial" : "success", {
          route,
          label: "recruiting-intelligence-api",
          ms: Math.round(performance.now() - started),
          partial: Boolean(parsed.meta?.partialSync),
        });
        setData(parsed.intelligence);
        setMeta(parsed.meta);
        setTimedOut(false);
        setError(null);
        initialDone.current = true;
      } finally {
        if (!mountedRef.current || generation !== fetchGeneration.current) return;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [enabled],
  );

  const refresh = useCallback(() => {
    invalidateCached(cacheKey(["recruiting", "intelligence"]));
    void runFetch("manual", true);
  }, [runFetch]);

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
