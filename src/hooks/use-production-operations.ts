"use client";

import type { ProductionOperationsSnapshot } from "@/lib/p149-autonomous-recruiting-production-readiness/types";
import type { ProductionReadinessReport } from "@/lib/p149-autonomous-recruiting-production-readiness/types";
import type { ObservabilityEntry } from "@/lib/p149-autonomous-recruiting-production-readiness/types";
import { friendlyFetchMessageFromError, isIgnorableFetchError } from "@/lib/friendly-fetch-errors";
import { fetchWithTimeout, HEAVY_REQUEST_TIMEOUT_MS, isAbortError } from "@/lib/fetch-with-timeout";
import { useCallback, useEffect, useRef, useState } from "react";

export function useProductionOperations() {
  const [snapshot, setSnapshot] = useState<ProductionOperationsSnapshot | null>(null);
  const [readiness, setReadiness] = useState<ProductionReadinessReport | null>(null);
  const [observability, setObservability] = useState<ObservabilityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setRefreshing(true);
    setError(null);
    try {
      const [opsRes, readinessRes] = await Promise.all([
        fetchWithTimeout("/api/recruiting/autonomous/operations", {
          cache: "no-store",
          timeoutMs: HEAVY_REQUEST_TIMEOUT_MS,
          signal: controller.signal,
        }),
        fetchWithTimeout("/api/recruiting/autonomous/production-readiness?skipDryRun=true", {
          cache: "no-store",
          timeoutMs: HEAVY_REQUEST_TIMEOUT_MS,
          signal: controller.signal,
        }),
      ]);
      const ops = (await opsRes.json()) as { ok: boolean; snapshot?: ProductionOperationsSnapshot; error?: string };
      const ready = (await readinessRes.json()) as { ok: boolean; report?: ProductionReadinessReport; error?: string };
      if (!opsRes.ok || !ops.snapshot) throw new Error(ops.error ?? "Failed to load operations");
      if (!readinessRes.ok || !ready.report) throw new Error(ready.error ?? "Failed to load readiness");
      setSnapshot(ops.snapshot);
      setReadiness(ready.report);
    } catch (err) {
      if (isAbortError(err)) return;
      if (!isIgnorableFetchError(err)) setError(friendlyFetchMessageFromError(err));
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, []);

  const searchHistory = useCallback(async (query: string) => {
    setSearchQuery(query);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      params.set("limit", "25");
      const res = await fetchWithTimeout(`/api/recruiting/autonomous/observability?${params}`, {
        cache: "no-store",
        timeoutMs: HEAVY_REQUEST_TIMEOUT_MS,
      });
      const parsed = (await res.json()) as { ok: boolean; entries?: ObservabilityEntry[] };
      if (parsed.entries) setObservability(parsed.entries);
    } catch {
      // non-critical
    }
  }, []);

  useEffect(() => {
    refresh().then(() => searchHistory(""));
    return () => abortRef.current?.abort();
  }, [refresh, searchHistory]);

  return {
    snapshot,
    readiness,
    observability,
    loading,
    refreshing,
    error,
    searchQuery,
    refresh,
    searchHistory,
  };
}
