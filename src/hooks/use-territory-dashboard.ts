"use client";

import { fetchJsonWithRetry } from "@/hooks/use-fetch-with-retry";
import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_POLL_MS = 90_000;

type DashboardMeta = {
  partialSync?: boolean;
  filteredJobs?: number;
  filteredCandidates?: number;
  refreshedAt?: string;
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
  const initialLoadDone = useRef(false);

  const fetchDashboard = useCallback(
    async (softRefresh: boolean) => {
      if (!enabled) return;
      if (softRefresh) setRefreshing(true);
      else if (!initialLoadDone.current) setLoading(true);
      setError(null);

      const result = await fetchJsonWithRetry<DashboardResponse<T>>(endpoint);
      if (!result.ok) {
        setError(result.error);
        if (!softRefresh) setData(null);
      } else {
        const parsed = result.data;
        if (!parsed.ok || !parsed.dashboard) {
          setError(parsed.error ?? "Failed to load dashboard");
          if (!softRefresh) setData(null);
        } else {
          setData(parsed.dashboard);
          setMeta(parsed.meta);
          initialLoadDone.current = true;
        }
      }

      setLoading(false);
      setRefreshing(false);
    },
    [enabled, endpoint],
  );

  const refresh = useCallback(() => {
    void fetchDashboard(true);
  }, [fetchDashboard]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    void (async () => {
      await fetchDashboard(false);
      if (cancelled) return;
    })();

    const interval = window.setInterval(() => {
      void fetchDashboard(true);
    }, pollIntervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [enabled, fetchDashboard, pollIntervalMs]);

  return { data, meta, error, loading, refreshing, refresh };
}
