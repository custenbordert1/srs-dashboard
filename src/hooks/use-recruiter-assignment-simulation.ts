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
import { P158_CLIENT_REQUEST_TIMEOUT_MS } from "@/lib/p158-autonomous-recruiter-assignment/assignment-config";
import type { P1581AssignmentSimulation } from "@/lib/p158-assignment-simulation/types";
import { EXECUTIVE_PANEL_LOADING_CEILING_MS, useLoadingCeiling } from "@/hooks/use-loading-ceiling";
import { useCallback, useEffect, useRef, useState } from "react";

const CACHE_KEY = cacheKey(["p158.1", "assignment-simulation"]);

type Payload = { simulation: P1581AssignmentSimulation; warnings: string[] };

export function useRecruiterAssignmentSimulation() {
  const initial = typeof window !== "undefined" ? getCachedAllowExpired<Payload>(CACHE_KEY) : null;
  const [simulation, setSimulation] = useState<P1581AssignmentSimulation | null>(
    initial?.simulation ?? null,
  );
  const [warnings, setWarnings] = useState<string[]>(initial?.warnings ?? []);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!initial?.simulation);
  const [refreshing, setRefreshing] = useState(false);
  const [runBusy, setRunBusy] = useState(false);
  const [runMessage, setRunMessage] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

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
    if (!simulation || force) setLoading(true);
    else setRefreshing(true);
    setError(null);

    try {
      const res = await fetchWithTimeout("/api/recruiting/recruiter-assignment-simulation", {
        cache: "no-store",
        timeoutMs: P158_CLIENT_REQUEST_TIMEOUT_MS,
      });
      const parsed = (await res.json()) as Payload & { error?: string };
      if (!res.ok) throw new Error(parsed.error ?? `Assignment simulation failed (${res.status})`);
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      setSimulation(parsed.simulation);
      setWarnings(parsed.warnings ?? parsed.simulation.warnings ?? []);
      setCached(CACHE_KEY, parsed, LONG_CLIENT_CACHE_TTL_MS);
    } catch (err) {
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      if (isIgnorableFetchError(err)) return;
      setError(
        (isTimeoutError(err)
          ? timeoutErrorMessage("Assignment simulation", P158_CLIENT_REQUEST_TIMEOUT_MS)
          : friendlyFetchMessageFromError(err, "dashboard")) ?? "Failed to load assignment simulation",
      );
    } finally {
      if (mountedRef.current && requestId === requestIdRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [simulation]);

  useEffect(() => {
    void load();
  }, [load]);

  const runSimulation = useCallback(async () => {
    setRunBusy(true);
    setRunMessage(null);
    setRunError(null);
    try {
      const res = await fetchWithTimeout("/api/recruiting/recruiter-assignment-simulation/run", {
        method: "POST",
        cache: "no-store",
        timeoutMs: P158_CLIENT_REQUEST_TIMEOUT_MS,
      });
      const parsed = (await res.json()) as {
        message?: string;
        error?: string;
        simulation?: P1581AssignmentSimulation;
      };
      if (!res.ok) throw new Error(parsed.error ?? "Simulation run failed");
      if (parsed.simulation) setSimulation(parsed.simulation);
      setRunMessage(parsed.message ?? "P158.1 simulation complete");
      await load(true);
    } catch (err) {
      setRunError(err instanceof Error ? err.message : "Simulation run failed");
    } finally {
      setRunBusy(false);
    }
  }, [load]);

  return {
    simulation,
    warnings,
    error,
    loading,
    refreshing,
    loadingCeilingHit,
    runBusy,
    runMessage,
    runError,
    refresh: () => load(true),
    runSimulation,
  };
}
