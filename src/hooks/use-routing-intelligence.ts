"use client";

import { fetchJsonWithRetry } from "@/hooks/use-fetch-with-retry";
import { cacheKey, getCachedAllowExpired, invalidateCached, LONG_CLIENT_CACHE_TTL_MS } from "@/lib/client-api-cache";
import { ROUTING_INTELLIGENCE_CLIENT_TIMEOUT_MS } from "@/lib/fetch-with-timeout";
import type { RoutingPlanningSnapshot } from "@/lib/routing-intelligence/build-routing-planning";
import type {
  RoutingIntelligenceSummary,
  RoutingScopeStatusFilter,
} from "@/lib/routing-intelligence/routing-intelligence-scope";
import { useCallback, useEffect, useRef, useState } from "react";

type RoutingResponse = {
  ok: boolean;
  error?: string;
  mode?: "summary" | "packs";
  summary?: RoutingIntelligenceSummary;
  routing?: RoutingPlanningSnapshot | null;
  packsError?: string | null;
  meta?: {
    refreshedAt?: string;
    melRowCount?: number;
    territoryRowCount?: number;
    scopedRowCount?: number;
    routingBuild?: {
      cacheHit: boolean;
      totalMs: number;
      clusteringMs: number;
      routePackMs: number;
      workspaceMs: number;
      payloadBytes: number;
    };
    escalations?: Array<{ id: string; city: string; state: string; jobTitle: string }>;
  };
};

const SUMMARY_CACHE_KEY = cacheKey(["recruiting", "routing", "summary"]);

export type RoutingScopeDraft = {
  dm?: string;
  state?: string;
  project?: string;
  status?: RoutingScopeStatusFilter;
};

function toSearchParams(scope: RoutingScopeDraft): URLSearchParams {
  const params = new URLSearchParams();
  if (scope.dm?.trim()) params.set("dm", scope.dm.trim());
  if (scope.state?.trim()) params.set("state", scope.state.trim());
  if (scope.project?.trim()) params.set("project", scope.project.trim());
  if (scope.status && scope.status !== "all") params.set("status", scope.status);
  return params;
}

export function useRoutingIntelligence() {
  const [summary, setSummary] = useState<RoutingIntelligenceSummary | null>(() => {
    const cached = getCachedAllowExpired<RoutingResponse>(SUMMARY_CACHE_KEY);
    return cached?.summary ?? null;
  });
  const [routing, setRouting] = useState<RoutingPlanningSnapshot | null>(null);
  const [scope, setScope] = useState<RoutingScopeDraft>({ status: "all" });
  const [error, setError] = useState<string | null>(null);
  const [packsError, setPacksError] = useState<string | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(
    () => !getCachedAllowExpired<RoutingResponse>(SUMMARY_CACHE_KEY),
  );
  const [buildingPacks, setBuildingPacks] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [stale, setStale] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(() => {
    const cached = getCachedAllowExpired<RoutingResponse>(SUMMARY_CACHE_KEY);
    return cached?.meta?.refreshedAt ?? cached?.summary?.fetchedAt ?? null;
  });
  const fetchGen = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const mounted = useRef(true);

  const fetchSummary = useCallback(async (force = false) => {
    const gen = fetchGen.current + 1;
    fetchGen.current = gen;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoadingSummary(true);
    setError(null);
    setTimedOut(false);

    const result = await fetchJsonWithRetry<RoutingResponse>(
      "/api/recruiting/routing-intelligence?mode=summary",
      undefined,
      {
        cacheKey: SUMMARY_CACHE_KEY,
        cacheTtlMs: force ? 0 : LONG_CLIENT_CACHE_TTL_MS,
        force,
        timeoutMs: ROUTING_INTELLIGENCE_CLIENT_TIMEOUT_MS,
        maxAttempts: 1,
        signal: controller.signal,
      },
    );

    if (!mounted.current || gen !== fetchGen.current) return;
    setLoadingSummary(false);

    if (!result.ok) {
      const cached = getCachedAllowExpired<RoutingResponse>(SUMMARY_CACHE_KEY);
      if (cached?.summary) {
        setSummary(cached.summary);
        setLastSyncedAt(cached.meta?.refreshedAt ?? cached.summary.fetchedAt);
        setStale(true);
        setError(result.error ?? "Using cached routing summary while sync retries.");
        if (result.timedOut) setTimedOut(true);
        return;
      }
      if (result.timedOut) setTimedOut(true);
      setError(result.error ?? "Failed to load routing summary.");
      return;
    }

    const parsed = result.data;
    if (!parsed.ok || !parsed.summary) {
      const cached = getCachedAllowExpired<RoutingResponse>(SUMMARY_CACHE_KEY);
      if (cached?.summary) {
        setSummary(cached.summary);
        setLastSyncedAt(cached.meta?.refreshedAt ?? cached.summary.fetchedAt);
        setStale(true);
        setError(parsed.error ?? "Using cached routing summary while sync retries.");
        return;
      }
      setError(parsed.error ?? "Failed to load routing summary.");
      return;
    }

    setSummary(parsed.summary);
    setRouting(null);
    setPacksError(null);
    setLastSyncedAt(parsed.meta?.refreshedAt ?? parsed.summary.fetchedAt);
    setStale(false);
  }, []);

  const buildPacks = useCallback(
    async (nextScope: RoutingScopeDraft) => {
      setScope(nextScope);
      setBuildingPacks(true);
      setPacksError(null);
      setError(null);

      const params = toSearchParams(nextScope);
      params.set("mode", "packs");

      const result = await fetchJsonWithRetry<RoutingResponse>(
        `/api/recruiting/routing-intelligence?${params.toString()}`,
        undefined,
        {
          cacheKey: cacheKey(["recruiting", "routing", "packs", params.toString()]),
          cacheTtlMs: LONG_CLIENT_CACHE_TTL_MS,
          timeoutMs: ROUTING_INTELLIGENCE_CLIENT_TIMEOUT_MS,
          maxAttempts: 1,
        },
      );

      if (!mounted.current) return;
      setBuildingPacks(false);

      if (!result.ok) {
        setError(result.error ?? "Failed to build route packs.");
        if (result.timedOut) setTimedOut(true);
        return;
      }

      const parsed = result.data;
      if (!parsed.ok) {
        setError(parsed.error ?? "Failed to build route packs.");
        return;
      }

      setSummary(parsed.summary ?? summary);
      setPacksError(parsed.packsError ?? null);
      setRouting(parsed.routing ?? null);
      setLastSyncedAt(parsed.meta?.refreshedAt ?? parsed.summary?.fetchedAt ?? lastSyncedAt);
    },
    [lastSyncedAt, summary],
  );

  const refresh = useCallback(() => {
    invalidateCached(SUMMARY_CACHE_KEY);
    void fetchSummary(true);
  }, [fetchSummary]);

  useEffect(() => {
    mounted.current = true;
    void fetchSummary(false);
    return () => {
      mounted.current = false;
      abortRef.current?.abort();
    };
  }, [fetchSummary]);

  return {
    summary,
    routing,
    scope,
    setScope,
    buildPacks,
    loadingSummary,
    buildingPacks,
    error,
    packsError,
    timedOut,
    stale,
    lastSyncedAt,
    refresh,
  };
}
