"use client";

import {
  cacheKey,
  fetchCachedJson,
  getCached,
  getCachedAllowExpired,
  invalidateCached,
  LONG_CLIENT_CACHE_TTL_MS,
} from "@/lib/client-api-cache";
import { friendlyFetchMessageFromError, isIgnorableFetchError } from "@/lib/friendly-fetch-errors";
import {
  fetchWithTimeout,
  HEAVY_REQUEST_TIMEOUT_MS,
  isAbortError,
} from "@/lib/fetch-with-timeout";
import type { PlacementCommandCenterSnapshot } from "@/lib/placement-command-center/client";
import { useCallback, useEffect, useRef, useState } from "react";

const PLACEMENT_CACHE_KEY = cacheKey(["placement-command-center"]);

type PlacementCachePayload = {
  snapshot: PlacementCommandCenterSnapshot;
  meta?: {
    correlationCount?: number;
    refreshedAt?: string;
    durationMs?: number;
  };
};

type PlacementResponse = {
  ok: boolean;
  error?: string;
  snapshot?: PlacementCommandCenterSnapshot;
  meta?: PlacementCachePayload["meta"];
};

function readPlacementCache(): PlacementCachePayload | null {
  return getCachedAllowExpired<PlacementCachePayload>(PLACEMENT_CACHE_KEY);
}

async function fetchPlacementSnapshot(signal?: AbortSignal): Promise<PlacementCachePayload> {
  const res = await fetchWithTimeout("/api/placement-command-center", {
    cache: "no-store",
    timeoutMs: HEAVY_REQUEST_TIMEOUT_MS,
    signal,
  });
  const parsed = (await res.json()) as PlacementResponse;
  if (!res.ok || !parsed.ok || !parsed.snapshot) {
    throw new Error(parsed.error ?? "Failed to load placement command center");
  }
  return { snapshot: parsed.snapshot, meta: parsed.meta };
}

export function usePlacementCommandCenter() {
  const initialCache = typeof window !== "undefined" ? readPlacementCache() : null;
  const [data, setData] = useState<PlacementCommandCenterSnapshot | null>(
    initialCache?.snapshot ?? null,
  );
  const [meta, setMeta] = useState<PlacementCachePayload["meta"]>(initialCache?.meta);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!initialCache?.snapshot);
  const [refreshing, setRefreshing] = useState(false);
  const [showingCachedSnapshot, setShowingCachedSnapshot] = useState(false);
  const fetchGeneration = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  const load = useCallback(async (manual = false) => {
    const generation = fetchGeneration.current + 1;
    fetchGeneration.current = generation;

    let signal: AbortSignal | undefined;
    if (manual) {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      signal = controller.signal;
    }

    if (manual) {
      setRefreshing(true);
    } else if (!getCached<PlacementCachePayload>(PLACEMENT_CACHE_KEY)?.snapshot) {
      setLoading(true);
    }
    setError(null);

    try {
      const result = await fetchCachedJson(
        PLACEMENT_CACHE_KEY,
        () => fetchPlacementSnapshot(signal),
        {
          ttlMs: LONG_CLIENT_CACHE_TTL_MS,
          force: manual,
          label: "placement-command-center",
          staleOnError: true,
          shouldCache: (payload) => Boolean(payload.snapshot),
        },
      );

      if (!mountedRef.current || generation !== fetchGeneration.current) return;
      setData(result.snapshot);
      setMeta(result.meta);
      setShowingCachedSnapshot(false);
    } catch (err) {
      if (!mountedRef.current || generation !== fetchGeneration.current) return;

      const stale = readPlacementCache();

      if (stale?.snapshot) {
        setData(stale.snapshot);
        setMeta(stale.meta);
        setShowingCachedSnapshot(true);
        if (!isIgnorableFetchError(err) && !isAbortError(err)) {
          setError(
            friendlyFetchMessageFromError(err, "generic") ??
              "Placement command center temporarily unavailable. Showing last loaded snapshot.",
          );
        }
        return;
      }

      if (isIgnorableFetchError(err) || isAbortError(err)) {
        return;
      }

      setError(
        friendlyFetchMessageFromError(err, "generic") ??
          "Placement command center temporarily unavailable. Retry shortly.",
      );
    } finally {
      if (!mountedRef.current || generation !== fetchGeneration.current) return;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    queueMicrotask(() => {
      if (mountedRef.current) void load(false);
    });
    return () => {
      mountedRef.current = false;
      fetchGeneration.current += 1;
    };
  }, [load]);

  const refresh = useCallback(() => {
    invalidateCached(PLACEMENT_CACHE_KEY);
    void load(true);
  }, [load]);

  const postAction = useCallback(
    async (action: string, payload: Record<string, string> = {}) => {
      setRefreshing(true);
      setError(null);
      try {
        const res = await fetchWithTimeout("/api/placement-command-center", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, ...payload }),
          timeoutMs: HEAVY_REQUEST_TIMEOUT_MS,
        });
        const parsed = (await res.json()) as PlacementResponse;
        if (!res.ok || !parsed.ok || !parsed.snapshot) {
          throw new Error(parsed.error ?? `Failed: ${action}`);
        }
        invalidateCached(PLACEMENT_CACHE_KEY);
        setData(parsed.snapshot);
        setShowingCachedSnapshot(false);
      } catch (err) {
        if (!isIgnorableFetchError(err) && !isAbortError(err)) {
          setError(err instanceof Error ? err.message : `Failed: ${action}`);
        }
      } finally {
        setRefreshing(false);
      }
    },
    [],
  );

  const planPlacementCorrelations = useCallback(
    () => postAction("plan-placement-correlations"),
    [postAction],
  );

  const approvePlacement = useCallback(
    (correlationId: string) => postAction("approve-placement", { correlationId }),
    [postAction],
  );

  const rejectPlacement = useCallback(
    (correlationId: string, reason?: string) =>
      postAction("reject-placement", { correlationId, ...(reason ? { reason } : {}) }),
    [postAction],
  );

  const needsReviewPlacement = useCallback(
    (correlationId: string, note?: string) =>
      postAction("needs-review-placement", { correlationId, ...(note ? { note } : {}) }),
    [postAction],
  );

  const executePlacement = useCallback(
    (correlationId: string) => postAction("execute-placement", { correlationId }),
    [postAction],
  );

  return {
    data,
    meta,
    error,
    loading,
    refreshing,
    showingCachedSnapshot,
    refresh,
    planPlacementCorrelations,
    approvePlacement,
    rejectPlacement,
    needsReviewPlacement,
    executePlacement,
  };
}
