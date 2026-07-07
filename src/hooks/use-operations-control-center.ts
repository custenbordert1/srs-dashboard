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
  HEAVY_REQUEST_TIMEOUT_MS,
  isAbortError,
  isTimeoutError,
  timeoutErrorMessage,
} from "@/lib/fetch-with-timeout";
import { P159_CLIENT_REQUEST_TIMEOUT_MS } from "@/lib/p159-operations-control-center/constants";
import type {
  P159ControlAction,
  P159OperationsControlCenter,
} from "@/lib/p159-operations-control-center/types";
import { EXECUTIVE_PANEL_LOADING_CEILING_MS, useLoadingCeiling } from "@/hooks/use-loading-ceiling";
import { useCallback, useEffect, useRef, useState } from "react";

const CACHE_KEY = cacheKey(["p159", "operations-control-center"]);

type DashboardPayload = {
  dashboard: P159OperationsControlCenter;
  warnings: string[];
};

function readCache(): DashboardPayload | null {
  if (typeof window === "undefined") return null;
  return getCachedAllowExpired<DashboardPayload>(CACHE_KEY);
}

async function fetchDashboard(): Promise<DashboardPayload> {
  const res = await fetchWithTimeout("/api/recruiting/operations-control-center", {
    cache: "no-store",
    timeoutMs: P159_CLIENT_REQUEST_TIMEOUT_MS,
  });
  const parsed = (await res.json()) as DashboardPayload & { error?: string };
  if (!res.ok || !parsed.dashboard) {
    throw new Error(parsed.error ?? `Operations control center failed (${res.status})`);
  }
  return { dashboard: parsed.dashboard, warnings: parsed.warnings ?? [] };
}

export function useOperationsControlCenter() {
  const initial = readCache();
  const [dashboard, setDashboard] = useState<P159OperationsControlCenter | null>(
    initial?.dashboard ?? null,
  );
  const [warnings, setWarnings] = useState<string[]>(initial?.warnings ?? []);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!initial?.dashboard);
  const [showingCachedSnapshot, setShowingCachedSnapshot] = useState(Boolean(initial?.dashboard));
  const [actionBusy, setActionBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const generationRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async (manual = false) => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    if (!manual && !dashboard) setLoading(true);
    setError(null);

    try {
      const payload = await fetchDashboard();
      if (!mountedRef.current || generationRef.current !== generation) return;
      setDashboard(payload.dashboard);
      setWarnings(payload.warnings);
      setShowingCachedSnapshot(false);
      setCached(CACHE_KEY, payload, LONG_CLIENT_CACHE_TTL_MS);
    } catch (err) {
      if (!mountedRef.current || generationRef.current !== generation) return;
      const cached = readCache();
      if (cached) {
        setDashboard(cached.dashboard);
        setWarnings(cached.warnings);
        setShowingCachedSnapshot(true);
        setError(
          isTimeoutError(err)
            ? timeoutErrorMessage("Operations control center", P159_CLIENT_REQUEST_TIMEOUT_MS)
            : friendlyFetchMessageFromError(err, "dashboard") ?? "Dashboard unavailable",
        );
      } else if (!isIgnorableFetchError(err)) {
        setError(friendlyFetchMessageFromError(err, "dashboard") ?? "Dashboard unavailable");
      }
    } finally {
      if (mountedRef.current && generationRef.current === generation) {
        setLoading(false);
      }
    }
  }, [dashboard]);

  useEffect(() => {
    void refresh(false);
  }, [refresh]);

  const loadingCeilingHit = useLoadingCeiling(loading && !dashboard, EXECUTIVE_PANEL_LOADING_CEILING_MS);

  const postControl = useCallback(
    async (action: P159ControlAction, body?: Record<string, unknown>) => {
      setActionBusy(true);
      setActionError(null);
      setActionMessage(null);
      try {
        const res = await fetchWithTimeout("/api/recruiting/operations-control-center/control", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, ...body }),
          timeoutMs: HEAVY_REQUEST_TIMEOUT_MS,
        });
        const data = (await res.json()) as {
          ok?: boolean;
          message?: string;
          dashboard?: P159OperationsControlCenter;
          error?: string;
        };
        if (!res.ok || !data.ok) {
          setActionError(data.message ?? data.error ?? "Control action failed");
          if (data.dashboard) setDashboard(data.dashboard);
          return;
        }
        if (data.dashboard) {
          setDashboard(data.dashboard);
          setCached(CACHE_KEY, { dashboard: data.dashboard, warnings: [] }, LONG_CLIENT_CACHE_TTL_MS);
        }
        setActionMessage(data.message ?? "Action complete.");
        await refresh(true);
      } catch (err) {
        if (!isAbortError(err)) {
          setActionError(friendlyFetchMessageFromError(err, "autopilot") ?? "Control action failed");
        }
      } finally {
        setActionBusy(false);
      }
    },
    [refresh],
  );

  return {
    dashboard,
    warnings,
    error,
    loading: loading && !dashboard && !loadingCeilingHit,
    loadingCeilingHit,
    showingCachedSnapshot,
    actionBusy,
    actionMessage,
    actionError,
    refresh,
    postControl,
  };
}
