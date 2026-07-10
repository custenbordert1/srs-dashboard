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
import { P155_CLIENT_REQUEST_TIMEOUT_MS } from "@/lib/p155-autopilot-operations-dashboard/constants";
import type {
  P155ExceptionRow,
  P155OperationsDashboard,
  P155RecentSendRow,
} from "@/lib/p155-autopilot-operations-dashboard/types";
import { EXECUTIVE_PANEL_LOADING_CEILING_MS, useLoadingCeiling } from "@/hooks/use-loading-ceiling";
import { useCallback, useEffect, useRef, useState } from "react";

const CACHE_PREFIX = "p155-autopilot";
const STATUS_KEY = cacheKey([CACHE_PREFIX, "status"]);
const SENDS_KEY = cacheKey([CACHE_PREFIX, "sends"]);
const EXCEPTIONS_KEY = cacheKey([CACHE_PREFIX, "exceptions"]);

type StatusPayload = {
  dashboard: P155OperationsDashboard;
  warnings: string[];
};

type SectionState<T> = {
  data: T | null;
  error: string | null;
  loading: boolean;
};

function readCache<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  return getCachedAllowExpired<T>(key);
}

async function fetchJsonWithTimeout<T>(url: string, label: string): Promise<T> {
  const res = await fetchWithTimeout(url, {
    cache: "no-store",
    timeoutMs: P155_CLIENT_REQUEST_TIMEOUT_MS,
  });
  const parsed = (await res.json()) as T & { error?: string };
  if (!res.ok) {
    throw new Error(parsed.error ?? `${label} failed (${res.status})`);
  }
  return parsed;
}

export function useRecruitingAutopilotOperations() {
  const initialDashboard = readCache<StatusPayload>(STATUS_KEY);
  const initialSends = readCache<P155RecentSendRow[]>(SENDS_KEY);
  const initialExceptions = readCache<P155ExceptionRow[]>(EXCEPTIONS_KEY);

  const [dashboard, setDashboard] = useState<P155OperationsDashboard | null>(
    initialDashboard?.dashboard ?? null,
  );
  const [recentSends, setRecentSends] = useState<P155RecentSendRow[]>(initialSends ?? []);
  const [exceptions, setExceptions] = useState<P155ExceptionRow[]>(initialExceptions ?? []);
  const [warnings, setWarnings] = useState<string[]>(initialDashboard?.warnings ?? []);
  const [sectionErrors, setSectionErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(!initialDashboard?.dashboard);
  const [refreshing, setRefreshing] = useState(false);
  const [showingCachedSnapshot, setShowingCachedSnapshot] = useState(
    Boolean(initialDashboard?.dashboard),
  );
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

  const loadStatus = useCallback(async (): Promise<SectionState<StatusPayload>> => {
    try {
      const data = await fetchJsonWithTimeout<{
        dashboard?: P155OperationsDashboard;
        warnings?: string[];
      }>("/api/recruiting/autopilot/status", "Autopilot status");
      if (!data.dashboard) throw new Error("Autopilot status returned no dashboard payload.");
      const payload = { dashboard: data.dashboard, warnings: data.warnings ?? [] };
      setCached(STATUS_KEY, payload, LONG_CLIENT_CACHE_TTL_MS);
      return { data: payload, error: null, loading: false };
    } catch (error) {
      const cached = readCache<StatusPayload>(STATUS_KEY);
      if (cached) {
        return {
          data: cached,
          error: friendlyFetchMessageFromError(error, "autopilot") ?? "Autopilot status unavailable",
          loading: false,
        };
      }
      throw error;
    }
  }, []);

  const loadSends = useCallback(async (): Promise<SectionState<P155RecentSendRow[]>> => {
    try {
      const data = await fetchJsonWithTimeout<{ sends?: P155RecentSendRow[] }>(
        "/api/recruiting/autopilot/recent-sends",
        "Recent sends",
      );
      const sends = data.sends ?? [];
      setCached(SENDS_KEY, sends, LONG_CLIENT_CACHE_TTL_MS);
      return { data: sends, error: null, loading: false };
    } catch (error) {
      const cached = readCache<P155RecentSendRow[]>(SENDS_KEY);
      if (cached) {
        return {
          data: cached,
          error: friendlyFetchMessageFromError(error, "dashboard") ?? "Recent sends unavailable",
          loading: false,
        };
      }
      return { data: [], error: friendlyFetchMessageFromError(error, "dashboard") ?? "Recent sends unavailable", loading: false };
    }
  }, []);

  const loadExceptions = useCallback(async (): Promise<SectionState<P155ExceptionRow[]>> => {
    try {
      const data = await fetchJsonWithTimeout<{
        exceptions?: P155ExceptionRow[];
        warnings?: string[];
      }>("/api/recruiting/autopilot/exceptions", "Exceptions");
      const rows = data.exceptions ?? [];
      setCached(EXCEPTIONS_KEY, rows, LONG_CLIENT_CACHE_TTL_MS);
      return { data: rows, error: null, loading: false };
    } catch (error) {
      const cached = readCache<P155ExceptionRow[]>(EXCEPTIONS_KEY);
      if (cached) {
        return {
          data: cached,
          error: friendlyFetchMessageFromError(error, "dashboard") ?? "Exceptions unavailable",
          loading: false,
        };
      }
      return {
        data: [],
        error: friendlyFetchMessageFromError(error, "dashboard") ?? "Exceptions unavailable",
        loading: false,
      };
    }
  }, []);

  const refresh = useCallback(
    async (manual = false) => {
      const generation = generationRef.current + 1;
      generationRef.current = generation;

      if (manual) setRefreshing(true);
      else setLoading(true);

      setSectionErrors([]);

      const results = await Promise.allSettled([loadStatus(), loadSends(), loadExceptions()]);
      if (!mountedRef.current || generationRef.current !== generation) return;

      const errors: string[] = [];
      let nextWarnings: string[] = [];
      let gotDashboard = false;

      const statusResult = results[0];
      if (statusResult.status === "fulfilled") {
        if (statusResult.value.data) {
          setDashboard(statusResult.value.data.dashboard);
          nextWarnings = statusResult.value.data.warnings;
          gotDashboard = true;
        }
        if (statusResult.value.error) errors.push(statusResult.value.error);
      } else if (!isIgnorableFetchError(statusResult.reason)) {
        const cached = readCache<StatusPayload>(STATUS_KEY);
        if (cached) {
          setDashboard(cached.dashboard);
          nextWarnings = cached.warnings;
          gotDashboard = true;
          errors.push(
            isTimeoutError(statusResult.reason)
              ? timeoutErrorMessage("Autopilot status", P155_CLIENT_REQUEST_TIMEOUT_MS)
              : friendlyFetchMessageFromError(statusResult.reason, "autopilot") ?? "Autopilot status unavailable",
          );
        } else {
          errors.push(
            friendlyFetchMessageFromError(statusResult.reason, "autopilot") ?? "Autopilot status unavailable",
          );
        }
      }

      const sendsResult = results[1];
      if (sendsResult.status === "fulfilled") {
        setRecentSends(sendsResult.value.data ?? []);
        if (sendsResult.value.error) errors.push(sendsResult.value.error);
      } else if (!isIgnorableFetchError(sendsResult.reason)) {
        const cached = readCache<P155RecentSendRow[]>(SENDS_KEY);
        setRecentSends(cached ?? []);
        errors.push(
          friendlyFetchMessageFromError(sendsResult.reason, "dashboard") ?? "Recent sends unavailable",
        );
      }

      const exceptionsResult = results[2];
      if (exceptionsResult.status === "fulfilled") {
        setExceptions(exceptionsResult.value.data ?? []);
        if (exceptionsResult.value.error) errors.push(exceptionsResult.value.error);
      } else if (!isIgnorableFetchError(exceptionsResult.reason)) {
        const cached = readCache<P155ExceptionRow[]>(EXCEPTIONS_KEY);
        setExceptions(cached ?? []);
        errors.push(
          friendlyFetchMessageFromError(exceptionsResult.reason, "dashboard") ?? "Exceptions unavailable",
        );
      }

      setWarnings(nextWarnings);
      setSectionErrors(errors);
      setShowingCachedSnapshot(gotDashboard && errors.length > 0);
      setLoading(false);
      setRefreshing(false);
    },
    [loadExceptions, loadSends, loadStatus],
  );

  useEffect(() => {
    void refresh(false);
  }, [refresh]);

  const loadingCeilingHit = useLoadingCeiling(loading && !dashboard, EXECUTIVE_PANEL_LOADING_CEILING_MS);

  const postControl = useCallback(
    async (action: string, body?: Record<string, unknown>) => {
      setActionBusy(true);
      setActionError(null);
      setActionMessage(null);
      try {
        const res = await fetchWithTimeout("/api/recruiting/autopilot/control", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, ...body }),
          timeoutMs: HEAVY_REQUEST_TIMEOUT_MS,
        });
        const data = (await res.json()) as {
          ok?: boolean;
          message?: string;
          dashboard?: P155OperationsDashboard;
          error?: string;
        };
        if (!res.ok || !data.ok) {
          setActionError(data.message ?? data.error ?? "Control action failed");
          if (data.dashboard) setDashboard(data.dashboard);
          return;
        }
        if (data.dashboard) {
          setDashboard(data.dashboard);
          setCached(STATUS_KEY, { dashboard: data.dashboard, warnings: [] }, LONG_CLIENT_CACHE_TTL_MS);
        }
        setActionMessage(data.message ?? "Action complete.");
        await refresh(true);
      } catch (error) {
        if (!isAbortError(error)) {
          setActionError(friendlyFetchMessageFromError(error, "autopilot") ?? "Control action failed");
        }
      } finally {
        setActionBusy(false);
      }
    },
    [refresh],
  );

  return {
    dashboard,
    recentSends,
    exceptions,
    warnings,
    sectionErrors,
    loading: loading && !dashboard && !loadingCeilingHit,
    loadingCeilingHit,
    refreshing,
    showingCachedSnapshot,
    actionBusy,
    actionMessage,
    actionError,
    refresh,
    postControl,
  };
}
