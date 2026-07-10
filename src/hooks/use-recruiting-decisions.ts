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
  P157DecisionDashboard,
  P157DecisionFilters,
} from "@/lib/p157-recruiter-decision-engine/types";
import { EXECUTIVE_PANEL_LOADING_CEILING_MS, useLoadingCeiling } from "@/hooks/use-loading-ceiling";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const CACHE_PREFIX = "p157-decisions";

type DashboardPayload = {
  dashboard: P157DecisionDashboard;
  warnings: string[];
};

function buildQuery(filters: P157DecisionFilters): string {
  const params = new URLSearchParams();
  if (filters.recruiter) params.set("recruiter", filters.recruiter);
  if (filters.dm) params.set("dm", filters.dm);
  if (filters.state) params.set("state", filters.state);
  if (filters.project) params.set("project", filters.project);
  if (filters.decision) params.set("decision", filters.decision);
  if (filters.confidenceMin != null) params.set("confidenceMin", String(filters.confidenceMin));
  if (filters.priorityMin != null) params.set("priorityMin", String(filters.priorityMin));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

function emptyFilters(): P157DecisionFilters {
  return {
    recruiter: null,
    dm: null,
    state: null,
    project: null,
    decision: null,
    confidenceMin: null,
    priorityMin: null,
  };
}

export function useRecruitingDecisions() {
  const [filters, setFilters] = useState<P157DecisionFilters>(emptyFilters);
  const cacheKeyForFilters = useMemo(
    () => cacheKey([CACHE_PREFIX, "dashboard", JSON.stringify(filters)]),
    [filters],
  );

  const initial =
    typeof window !== "undefined" ? getCachedAllowExpired<DashboardPayload>(cacheKeyForFilters) : null;

  const [dashboard, setDashboard] = useState<P157DecisionDashboard | null>(initial?.dashboard ?? null);
  const [warnings, setWarnings] = useState<string[]>(initial?.warnings ?? []);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!initial?.dashboard);
  const [refreshing, setRefreshing] = useState(false);
  const [showingCachedSnapshot, setShowingCachedSnapshot] = useState(Boolean(initial?.dashboard));

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
      if (!dashboard || force) setLoading(true);
      else setRefreshing(true);
      setError(null);

      try {
        const res = await fetchWithTimeout(
          `/api/recruiting/recommended-actions${buildQuery(filters)}`,
          { cache: "no-store", timeoutMs: P161_CLIENT_DASHBOARD_FETCH_TIMEOUT_MS },
        );
        const parsed = (await res.json()) as DashboardPayload & { error?: string };
        if (!res.ok) throw new Error(parsed.error ?? `Recommended actions failed (${res.status})`);
        if (!mountedRef.current || requestId !== requestIdRef.current) return;

        setDashboard(parsed.dashboard);
        setWarnings(parsed.warnings ?? parsed.dashboard.warnings ?? []);
        setShowingCachedSnapshot(false);
        setCached(cacheKeyForFilters, parsed, LONG_CLIENT_CACHE_TTL_MS);
      } catch (err) {
        if (!mountedRef.current || requestId !== requestIdRef.current) return;
        if (isIgnorableFetchError(err)) return;
        const message =
          (isTimeoutError(err)
            ? timeoutErrorMessage("Recruiting decisions", P161_CLIENT_DASHBOARD_FETCH_TIMEOUT_MS)
            : friendlyFetchMessageFromError(err, "dashboard")) ??
          "Failed to load recruiting decisions";

        const cached = getCachedAllowExpired<DashboardPayload>(cacheKeyForFilters);
        if (cached?.dashboard) {
          setDashboard(cached.dashboard);
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
    [cacheKeyForFilters, dashboard, filters],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const updateFilter = useCallback(<K extends keyof P157DecisionFilters>(key: K, value: P157DecisionFilters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const clearFilters = useCallback(() => setFilters(emptyFilters()), []);

  return {
    dashboard,
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
