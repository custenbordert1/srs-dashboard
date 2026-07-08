"use client";

import {
  cacheKey,
  getCachedAllowExpired,
  LONG_CLIENT_CACHE_TTL_MS,
  setCached,
} from "@/lib/client-api-cache";
import { friendlyFetchMessageFromError, isIgnorableFetchError } from "@/lib/friendly-fetch-errors";
import {
  fetchWithTimeout,
  isTimeoutError,
  timeoutErrorMessage,
} from "@/lib/fetch-with-timeout";
import {
  P161_CLIENT_DASHBOARD_FETCH_TIMEOUT_MS,
  P161_CLIENT_SECTION_TIMEOUT_MS,
} from "@/lib/app-loading-reliability/constants";
import type {
  P156PrioritizedQueue,
  P156QueueFilters,
} from "@/lib/p156-candidate-prioritization/types";
import { EXECUTIVE_PANEL_LOADING_CEILING_MS, useLoadingCeiling } from "@/hooks/use-loading-ceiling";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const CACHE_PREFIX = "p156-priorities";

type QueuePayload = {
  queue: P156PrioritizedQueue;
  warnings: string[];
};

function buildQuery(filters: P156QueueFilters): string {
  const params = new URLSearchParams();
  if (filters.recruiter) params.set("recruiter", filters.recruiter);
  if (filters.dm) params.set("dm", filters.dm);
  if (filters.state) params.set("state", filters.state);
  if (filters.project) params.set("project", filters.project);
  if (filters.stage) params.set("stage", filters.stage);
  if (filters.priorityMin != null) params.set("priorityMin", String(filters.priorityMin));
  if (filters.priorityMax != null) params.set("priorityMax", String(filters.priorityMax));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

function emptyFilters(): P156QueueFilters {
  return {
    recruiter: null,
    dm: null,
    state: null,
    project: null,
    priorityMin: null,
    priorityMax: null,
    stage: null,
  };
}

export function useRecruitingPriorities() {
  const [filters, setFilters] = useState<P156QueueFilters>(emptyFilters);
  const cacheKeyForFilters = useMemo(
    () => cacheKey([CACHE_PREFIX, "queue", JSON.stringify(filters)]),
    [filters],
  );

  const initial = typeof window !== "undefined" ? getCachedAllowExpired<QueuePayload>(cacheKeyForFilters) : null;

  const [queue, setQueue] = useState<P156PrioritizedQueue | null>(initial?.queue ?? null);
  const [warnings, setWarnings] = useState<string[]>(initial?.warnings ?? []);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!initial?.queue);
  const [refreshing, setRefreshing] = useState(false);
  const [showingCachedSnapshot, setShowingCachedSnapshot] = useState(Boolean(initial?.queue));

  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadingCeilingHit = useLoadingCeiling(loading, EXECUTIVE_PANEL_LOADING_CEILING_MS);

  const load = useCallback(
    async (force = false) => {
      const requestId = ++requestIdRef.current;
      if (!queue || force) setLoading(true);
      else setRefreshing(true);
      setError(null);

      try {
        const res = await fetchWithTimeout(`/api/recruiting/prioritized-queue${buildQuery(filters)}`, {
          cache: "no-store",
          timeoutMs: P161_CLIENT_DASHBOARD_FETCH_TIMEOUT_MS,
        });
        const parsed = (await res.json()) as QueuePayload & { error?: string };
        if (!res.ok) {
          throw new Error(parsed.error ?? `Prioritized queue failed (${res.status})`);
        }
        if (!mountedRef.current || requestId !== requestIdRef.current) return;

        setQueue(parsed.queue);
        setWarnings(parsed.warnings ?? parsed.queue.warnings ?? []);
        setShowingCachedSnapshot(false);
        setCached(cacheKeyForFilters, parsed, LONG_CLIENT_CACHE_TTL_MS);
      } catch (err) {
        if (!mountedRef.current || requestId !== requestIdRef.current) return;
        if (isIgnorableFetchError(err)) return;

        const message =
          (isTimeoutError(err)
            ? timeoutErrorMessage("Recruiting priorities", P161_CLIENT_DASHBOARD_FETCH_TIMEOUT_MS)
            : friendlyFetchMessageFromError(err, "dashboard")) ??
          "Failed to load recruiting priorities";

        const cached = getCachedAllowExpired<QueuePayload>(cacheKeyForFilters);
        if (cached?.queue) {
          setQueue(cached.queue);
          setWarnings(cached.warnings ?? []);
          setShowingCachedSnapshot(true);
          setError(message);
        } else {
          setError(message);
        }
      } finally {
        if (mountedRef.current && requestId === requestIdRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [cacheKeyForFilters, filters, queue],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const updateFilter = useCallback(<K extends keyof P156QueueFilters>(key: K, value: P156QueueFilters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters(emptyFilters());
  }, []);

  return {
    queue,
    warnings,
    error,
    loading,
    refreshing,
    loadingCeilingHit,
    showingCachedSnapshot,
    filters,
    updateFilter,
    clearFilters,
    refresh: () => load(true),
  };
}
