"use client";

import type { RecruitingIntelligenceSnapshot } from "@/lib/recruiting-automation";
import { fetchJsonWithRetry } from "@/hooks/use-fetch-with-retry";
import { cacheKey, invalidateCached, LONG_CLIENT_CACHE_TTL_MS } from "@/lib/client-api-cache";
import { DASHBOARD_REQUEST_TIMEOUT_MS } from "@/lib/fetch-with-timeout";
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

      try {
        const result = await fetchJsonWithRetry<IntelligenceResponse>("/api/recruiting/intelligence", undefined, {
          cacheKey: cacheKey(["recruiting", "intelligence"]),
          cacheTtlMs: forceRefresh ? 0 : LONG_CLIENT_CACHE_TTL_MS,
          force: forceRefresh,
          timeoutMs: DASHBOARD_REQUEST_TIMEOUT_MS,
          signal: controller.signal,
        });

        if (!mountedRef.current || generation !== fetchGeneration.current) return;

        if (!result.ok) {
          if (result.aborted) return;
          if (mode === "background" && initialDone.current) return;
          if (result.timedOut) {
            setTimedOut(true);
            setError(result.error);
          } else {
            setError(result.error);
            if (mode === "initial") setData(null);
          }
          return;
        }

        const parsed = result.data;
        if (!parsed.ok || !parsed.intelligence) {
          setError(parsed.error ?? "Failed to load recruiting intelligence");
          if (mode === "initial") setData(null);
          return;
        }

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
