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
import type { P158AssignmentDashboard } from "@/lib/p158-autonomous-recruiter-assignment/types";
import { EXECUTIVE_PANEL_LOADING_CEILING_MS, useLoadingCeiling } from "@/hooks/use-loading-ceiling";
import { useCallback, useEffect, useRef, useState } from "react";

const CACHE_KEY = cacheKey(["p158", "assignments"]);

type Payload = { dashboard: P158AssignmentDashboard; warnings: string[] };

export function useRecruiterAssignmentCenter() {
  const initial = typeof window !== "undefined" ? getCachedAllowExpired<Payload>(CACHE_KEY) : null;
  const [dashboard, setDashboard] = useState<P158AssignmentDashboard | null>(initial?.dashboard ?? null);
  const [warnings, setWarnings] = useState<string[]>(initial?.warnings ?? []);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!initial?.dashboard);
  const [refreshing, setRefreshing] = useState(false);
  const [runBusy, setRunBusy] = useState(false);
  const [runMessage, setRunMessage] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
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

  const load = useCallback(async (force = false) => {
    const requestId = ++requestIdRef.current;
    if (!dashboard || force) setLoading(true);
    else setRefreshing(true);
    setError(null);

    try {
      const res = await fetchWithTimeout("/api/recruiting/recruiter-assignments", {
        cache: "no-store",
        timeoutMs: P161_CLIENT_DASHBOARD_FETCH_TIMEOUT_MS,
      });
      const parsed = (await res.json()) as Payload & { error?: string };
      if (!res.ok) throw new Error(parsed.error ?? `Assignment dashboard failed (${res.status})`);
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      setDashboard(parsed.dashboard);
      setWarnings(parsed.warnings ?? parsed.dashboard.warnings ?? []);
      setShowingCachedSnapshot(false);
      setCached(CACHE_KEY, parsed, LONG_CLIENT_CACHE_TTL_MS);
    } catch (err) {
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      if (isIgnorableFetchError(err)) return;
      const message =
        (isTimeoutError(err)
          ? timeoutErrorMessage("Recruiter assignments", P161_CLIENT_DASHBOARD_FETCH_TIMEOUT_MS)
          : friendlyFetchMessageFromError(err, "dashboard")) ?? "Failed to load assignment center";
      const cached = getCachedAllowExpired<Payload>(CACHE_KEY);
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
  }, [dashboard]);

  useEffect(() => {
    void load();
  }, [load]);

  const runSimulation = useCallback(async () => {
    setRunBusy(true);
    setRunMessage(null);
    setRunError(null);
    try {
      const res = await fetchWithTimeout(
        "/api/recruiting/recruiter-assignments/run?transitionAfterAssignment=true",
        {
          method: "POST",
          cache: "no-store",
          timeoutMs: P161_CLIENT_DASHBOARD_FETCH_TIMEOUT_MS,
        },
      );
      const parsed = (await res.json()) as {
        message?: string;
        error?: string;
        dashboard?: P158AssignmentDashboard;
        transition?: { projectedSendPaperwork?: number; transitionsCompleted?: number };
      };
      if (!res.ok) throw new Error(parsed.error ?? "Simulation failed");
      if (parsed.dashboard) setDashboard(parsed.dashboard);
      const transitionNote =
        parsed.transition != null
          ? ` · ${parsed.transition.transitionsCompleted ?? 0} transition(s), ${parsed.transition.projectedSendPaperwork ?? 0} projected Send Paperwork`
          : "";
      setRunMessage((parsed.message ?? "Simulation complete") + transitionNote);
      await load(true);
    } catch (err) {
      setRunError(err instanceof Error ? err.message : "Simulation failed");
    } finally {
      setRunBusy(false);
    }
  }, [load]);

  const runProduction = useCallback(async () => {
    setRunBusy(true);
    setRunMessage(null);
    setRunError(null);
    try {
      const res = await fetchWithTimeout(
        "/api/recruiting/recruiter-assignments/run?confirmAssignment=true",
        { method: "POST", cache: "no-store", timeoutMs: P161_CLIENT_SECTION_TIMEOUT_MS },
      );
      const parsed = (await res.json()) as { message?: string; error?: string; dashboard?: P158AssignmentDashboard };
      if (!res.ok) throw new Error(parsed.error ?? "Production run failed");
      if (parsed.dashboard) setDashboard(parsed.dashboard);
      setRunMessage(parsed.message ?? "Production run complete");
      await load(true);
    } catch (err) {
      setRunError(err instanceof Error ? err.message : "Production run failed");
    } finally {
      setRunBusy(false);
    }
  }, [load]);

  return {
    dashboard,
    warnings,
    error,
    loading,
    refreshing,
    loadingCeilingHit,
    showingCachedSnapshot,
    runBusy,
    runMessage,
    runError,
    refresh: () => load(true),
    runSimulation,
    runProduction,
  };
}
