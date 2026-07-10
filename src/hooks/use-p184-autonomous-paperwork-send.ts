"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  P184CycleResult,
  P184DashboardMetrics,
  P184EngineConfig,
} from "@/lib/p184-autonomous-paperwork-send-engine";

type P184ApiResponse = {
  ok: boolean;
  config?: P184EngineConfig;
  metrics?: P184DashboardMetrics;
  result?: P184CycleResult;
  report?: P184CycleResult["report"];
  error?: string;
  warnings?: string[];
};

export function useP184AutonomousPaperworkSend() {
  const [config, setConfig] = useState<P184EngineConfig | null>(null);
  const [metrics, setMetrics] = useState<P184DashboardMetrics | null>(null);
  const [lastResult, setLastResult] = useState<P184CycleResult | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/p184-autonomous-paperwork-send");
      const body = (await res.json()) as P184ApiResponse;
      if (!res.ok || !body.ok) {
        setError(body.error ?? `Request failed (${res.status})`);
        return;
      }
      setConfig(body.config ?? null);
      setMetrics(body.metrics ?? null);
      setWarnings(body.warnings ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load P184 status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const runCycle = useCallback(
    async (mode: "dry_run" | "live") => {
      setActing(true);
      setError(null);
      try {
        const res = await fetch("/api/p184-autonomous-paperwork-send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "run", mode }),
        });
        const body = (await res.json()) as P184ApiResponse;
        if (!res.ok || !body.ok) {
          setError(body.error ?? `Run failed (${res.status})`);
          return null;
        }
        if (body.result) setLastResult(body.result);
        if (body.metrics) setMetrics(body.metrics);
        await refresh();
        return body.result ?? null;
      } catch (err) {
        setError(err instanceof Error ? err.message : "P184 run failed");
        return null;
      } finally {
        setActing(false);
      }
    },
    [refresh],
  );

  return {
    config,
    metrics,
    lastResult,
    warnings,
    loading,
    acting,
    error,
    refresh,
    runDryRun: () => runCycle("dry_run"),
    runLive: () => runCycle("live"),
  };
}
