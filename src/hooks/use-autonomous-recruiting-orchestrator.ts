"use client";

import type { OrchestratorStatusSnapshot } from "@/lib/p148-autonomous-recruiting-orchestrator/types";
import type { AutonomousRecruitingCycleResult } from "@/lib/p148-autonomous-recruiting-orchestrator/types";
import { friendlyFetchMessageFromError, isIgnorableFetchError } from "@/lib/friendly-fetch-errors";
import { fetchWithTimeout, HEAVY_REQUEST_TIMEOUT_MS, isAbortError } from "@/lib/fetch-with-timeout";
import { useCallback, useEffect, useRef, useState } from "react";

type StatusResponse = {
  ok: boolean;
  status?: OrchestratorStatusSnapshot;
  enabled?: boolean;
  error?: string;
};

type RunResponse = {
  ok: boolean;
  result?: AutonomousRecruitingCycleResult;
  enabled?: boolean;
  message?: string;
  error?: string;
};

export function useAutonomousRecruitingOrchestrator() {
  const [status, setStatus] = useState<OrchestratorStatusSnapshot | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastExecution, setLastExecution] = useState<AutonomousRecruitingCycleResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetchWithTimeout("/api/recruiting/autonomous/status", {
        cache: "no-store",
        timeoutMs: HEAVY_REQUEST_TIMEOUT_MS,
        signal: controller.signal,
      });
      const parsed = (await res.json()) as StatusResponse;
      if (!res.ok || !parsed.status) {
        throw new Error(parsed.error ?? "Failed to load orchestrator status");
      }
      setStatus(parsed.status);
      setEnabled(parsed.enabled ?? false);
    } catch (err) {
      if (isAbortError(err)) return;
      if (!isIgnorableFetchError(err)) {
        setError(friendlyFetchMessageFromError(err));
      }
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, []);

  const runCycle = useCallback(async (dryRun = true) => {
    setActing(true);
    setError(null);
    try {
      const res = await fetchWithTimeout("/api/recruiting/autonomous/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun }),
        cache: "no-store",
        timeoutMs: HEAVY_REQUEST_TIMEOUT_MS,
      });
      const parsed = (await res.json()) as RunResponse;
      if (!res.ok || !parsed.result) {
        throw new Error(parsed.error ?? "Orchestrator run failed");
      }
      setLastExecution(parsed.result);
      setEnabled(parsed.enabled ?? false);
      await refresh();
      return parsed.result;
    } catch (err) {
      const message = friendlyFetchMessageFromError(err);
      setError(message);
      throw err;
    } finally {
      setActing(false);
    }
  }, [refresh]);

  useEffect(() => {
    refresh();
    return () => abortRef.current?.abort();
  }, [refresh]);

  return {
    status,
    enabled,
    loading,
    refreshing,
    acting,
    error,
    lastExecution,
    refresh,
    runDryRun: () => runCycle(true),
    runLive: () => runCycle(false),
  };
}
