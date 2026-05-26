"use client";

import type { RecruitingIntelligenceSnapshot } from "@/lib/recruiting-automation";
import type { RecruiterEscalationQueueItem } from "@/lib/operational-escalation/operational-escalation-types";
import { fetchJsonWithRetry } from "@/hooks/use-fetch-with-retry";
import {
  cacheKey,
  getCachedAllowExpired,
  invalidateCached,
  LONG_CLIENT_CACHE_TTL_MS,
} from "@/lib/client-api-cache";
import { logDashboardFetch } from "@/lib/dashboard-fetch-log";
import { DASHBOARD_REQUEST_TIMEOUT_MS } from "@/lib/fetch-with-timeout";
import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_POLL_MS = 90_000;
const INTELLIGENCE_CACHE_KEY = cacheKey(["recruiting", "intelligence"]);

type IntelligenceMeta = {
  partialSync?: boolean;
  filteredJobs?: number;
  filteredCandidates?: number;
  refreshedAt?: string;
  partialErrors?: string[];
  breezyJobsOk?: boolean;
  breezyCandidatesOk?: boolean;
  escalations?: RecruiterEscalationQueueItem[];
  activeRepsByState?: Record<string, number>;
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

  const [data, setData] = useState<RecruitingIntelligenceSnapshot | null>(() => {
    const cached = getCachedAllowExpired<IntelligenceResponse>(INTELLIGENCE_CACHE_KEY);
    return cached?.intelligence ?? null;
  });
  const [meta, setMeta] = useState<IntelligenceMeta | undefined>(() => {
    const cached = getCachedAllowExpired<IntelligenceResponse>(INTELLIGENCE_CACHE_KEY);
    return cached?.meta;
  });
  const [error, setError] = useState<string | null>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [loading, setLoading] = useState(() => !getCachedAllowExpired<IntelligenceResponse>(INTELLIGENCE_CACHE_KEY));
  const [refreshing, setRefreshing] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [stale, setStale] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(() => {
    const cached = getCachedAllowExpired<IntelligenceResponse>(INTELLIGENCE_CACHE_KEY);
    return cached?.meta?.refreshedAt ?? cached?.intelligence?.fetchedAt ?? null;
  });

  const initialDone = useRef(Boolean(data));
  const fetchGeneration = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  const applySuccess = useCallback((parsed: IntelligenceResponse) => {
    if (!parsed.intelligence) return;
    setData(parsed.intelligence);
    setMeta(parsed.meta);
    setLastSyncedAt(parsed.meta?.refreshedAt ?? parsed.intelligence.fetchedAt);
    setTimedOut(false);
    setStale(false);
    setError(null);
    setFatalError(null);
    initialDone.current = true;
  }, []);

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
      if (mode !== "background") {
        setError(null);
        setFatalError(null);
      }

      const route = "/api/recruiting/intelligence";
      const started = performance.now();
      logDashboardFetch("start", { route, label: "recruiting-intelligence-api" });

      try {
        const result = await fetchJsonWithRetry<IntelligenceResponse>(route, undefined, {
          cacheKey: INTELLIGENCE_CACHE_KEY,
          cacheTtlMs: forceRefresh ? 0 : LONG_CLIENT_CACHE_TTL_MS,
          force: forceRefresh,
          timeoutMs: DASHBOARD_REQUEST_TIMEOUT_MS,
          maxAttempts: 1,
          signal: controller.signal,
        });

        if (!mountedRef.current || generation !== fetchGeneration.current) return;

        if (!result.ok) {
          if (result.aborted) return;
          const cached = getCachedAllowExpired<IntelligenceResponse>(INTELLIGENCE_CACHE_KEY);
          if (cached?.intelligence) {
            applySuccess(cached);
            setStale(true);
            setError(result.error ?? "Using cached automation snapshot while sync retries.");
            logDashboardFetch("partial", {
              route,
              label: "recruiting-intelligence-api",
              ms: Math.round(performance.now() - started),
            });
            return;
          }
          logDashboardFetch(result.timedOut ? "timeout" : "error", {
            route,
            label: "recruiting-intelligence-api",
            ms: Math.round(performance.now() - started),
            error: result.error,
          });
          if (result.timedOut) setTimedOut(true);
          setError(result.error);
          setFatalError(result.error);
          return;
        }

        const parsed = result.data;
        if (!parsed.ok || !parsed.intelligence) {
          const message = parsed.error ?? "Failed to load recruiting intelligence";
          const cached = getCachedAllowExpired<IntelligenceResponse>(INTELLIGENCE_CACHE_KEY);
          if (cached?.intelligence) {
            applySuccess(cached);
            setStale(true);
            setError(message);
            return;
          }
          logDashboardFetch("error", {
            route,
            label: "recruiting-intelligence-api",
            ms: Math.round(performance.now() - started),
            error: message,
          });
          setError(message);
          setFatalError(message);
          return;
        }

        logDashboardFetch(parsed.meta?.partialSync ? "partial" : "success", {
          route,
          label: "recruiting-intelligence-api",
          ms: Math.round(performance.now() - started),
          partial: Boolean(parsed.meta?.partialSync || parsed.meta?.partialErrors?.length),
        });
        applySuccess(parsed);
        if (parsed.meta?.partialErrors?.length || parsed.meta?.partialSync) {
          setError("Some ATS sections are partial — operational recommendations remain available.");
        }
      } finally {
        if (!mountedRef.current || generation !== fetchGeneration.current) return;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [applySuccess, enabled],
  );

  const refresh = useCallback(() => {
    invalidateCached(INTELLIGENCE_CACHE_KEY);
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

  return {
    data,
    meta,
    error,
    fatalError,
    loading,
    refreshing,
    timedOut,
    stale,
    lastSyncedAt,
    refresh,
  };
}
