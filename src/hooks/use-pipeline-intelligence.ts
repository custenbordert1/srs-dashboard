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
import type { PipelineIntelligenceSnapshot } from "@/lib/pipeline-intelligence/client";
import { useCallback, useEffect, useRef, useState } from "react";

const PIPELINE_CACHE_KEY = cacheKey(["pipeline-intelligence"]);

type PipelineCachePayload = {
  snapshot: PipelineIntelligenceSnapshot;
  meta?: {
    partialSync?: boolean;
    totalCandidates?: number;
    refreshedAt?: string;
  };
};

type PipelineResponse = {
  ok: boolean;
  error?: string;
  snapshot?: PipelineIntelligenceSnapshot;
  meta?: PipelineCachePayload["meta"];
};

function readPipelineCache(): PipelineCachePayload | null {
  return getCachedAllowExpired<PipelineCachePayload>(PIPELINE_CACHE_KEY);
}

async function fetchPipelineSnapshot(signal?: AbortSignal): Promise<PipelineCachePayload> {
  const res = await fetchWithTimeout("/api/pipeline-intelligence", {
    cache: "no-store",
    timeoutMs: HEAVY_REQUEST_TIMEOUT_MS,
    signal,
  });
  const parsed = (await res.json()) as PipelineResponse;
  if (!res.ok || !parsed.ok || !parsed.snapshot) {
    throw new Error(parsed.error ?? "Failed to load pipeline intelligence");
  }
  return { snapshot: parsed.snapshot, meta: parsed.meta };
}

export function usePipelineIntelligence() {
  const initialCache = typeof window !== "undefined" ? readPipelineCache() : null;
  const [data, setData] = useState<PipelineIntelligenceSnapshot | null>(
    initialCache?.snapshot ?? null,
  );
  const [meta, setMeta] = useState<PipelineCachePayload["meta"]>(initialCache?.meta);
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
    } else if (!getCached<PipelineCachePayload>(PIPELINE_CACHE_KEY)?.snapshot) {
      setLoading(true);
    }
    setError(null);

    try {
      const result = await fetchCachedJson(
        PIPELINE_CACHE_KEY,
        () => fetchPipelineSnapshot(signal),
        {
          ttlMs: LONG_CLIENT_CACHE_TTL_MS,
          force: manual,
          label: "pipeline-intelligence",
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

      const stale = readPipelineCache();

      if (stale?.snapshot) {
        setData(stale.snapshot);
        setMeta(stale.meta);
        setShowingCachedSnapshot(true);
        if (!isIgnorableFetchError(err) && !isAbortError(err)) {
          setError(
            friendlyFetchMessageFromError(err, "pipeline") ??
              "Pipeline intelligence temporarily unavailable. Showing last loaded snapshot.",
          );
        }
        return;
      }

      if (isIgnorableFetchError(err) || isAbortError(err)) {
        return;
      }

      setError(
        friendlyFetchMessageFromError(err, "pipeline") ??
          "Pipeline intelligence temporarily unavailable. Retry shortly.",
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
    invalidateCached(PIPELINE_CACHE_KEY);
    void load(true);
  }, [load]);

  return {
    data,
    meta,
    error,
    loading,
    refreshing,
    showingCachedSnapshot,
    refresh,
  };
}
