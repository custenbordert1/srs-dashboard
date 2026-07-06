"use client";

import {
  cacheKey,
  fetchCachedJson,
  getCachedAllowExpired,
  LONG_CLIENT_CACHE_TTL_MS,
} from "@/lib/client-api-cache";
import { friendlyFetchMessageFromError, isIgnorableFetchError } from "@/lib/friendly-fetch-errors";
import { fetchWithTimeout, HEAVY_REQUEST_TIMEOUT_MS, isAbortError } from "@/lib/fetch-with-timeout";
import type { CandidateAdvancementIntelligenceSnapshot } from "@/lib/p144-candidate-advancement-intelligence/types";
import { useCallback, useEffect, useRef, useState } from "react";

const CACHE_KEY = cacheKey(["recruiting", "candidate-intelligence"]);

type CachePayload = {
  snapshot: CandidateAdvancementIntelligenceSnapshot;
  meta?: {
    partialSync?: boolean;
    candidatesFromIngestionStore?: boolean;
    candidateSource?: string | null;
    refreshedAt?: string;
  };
};

type ApiResponse = {
  ok: boolean;
  error?: string;
  snapshot?: CandidateAdvancementIntelligenceSnapshot;
  meta?: CachePayload["meta"];
  partial?: boolean;
};

function readCache(): CachePayload | null {
  return getCachedAllowExpired<CachePayload>(CACHE_KEY);
}

async function fetchSnapshot(signal?: AbortSignal): Promise<CachePayload> {
  const res = await fetchWithTimeout("/api/recruiting/candidate-intelligence", {
    cache: "no-store",
    timeoutMs: HEAVY_REQUEST_TIMEOUT_MS,
    signal,
  });
  const parsed = (await res.json()) as ApiResponse;
  if ((!res.ok && !parsed.partial) || !parsed.snapshot) {
    throw new Error(parsed.error ?? "Failed to load candidate advancement intelligence");
  }
  return { snapshot: parsed.snapshot, meta: parsed.meta };
}

export function useCandidateAdvancementIntelligence() {
  const initial = typeof window !== "undefined" ? readCache() : null;
  const [data, setData] = useState<CandidateAdvancementIntelligenceSnapshot | null>(
    initial?.snapshot ?? null,
  );
  const [meta, setMeta] = useState<CachePayload["meta"]>(initial?.meta);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!initial?.snapshot);
  const [refreshing, setRefreshing] = useState(false);
  const [showingCachedSnapshot, setShowingCachedSnapshot] = useState(false);
  const generation = useRef(0);

  const load = useCallback(async (manual = false) => {
    const current = generation.current + 1;
    generation.current = current;
    if (manual) setRefreshing(true);
    else setLoading(true);
    setError(null);
    setShowingCachedSnapshot(false);

    try {
      const payload = await fetchCachedJson(CACHE_KEY, () => fetchSnapshot(), {
        ttlMs: LONG_CLIENT_CACHE_TTL_MS,
        force: manual,
        label: "candidate-advancement-intelligence",
        staleOnError: true,
      });
      if (generation.current !== current) return;
      setData(payload.snapshot);
      setMeta(payload.meta);
    } catch (err) {
      if (isAbortError(err)) return;
      const cached = readCache();
      if (cached?.snapshot) {
        setData(cached.snapshot);
        setMeta(cached.meta);
        setShowingCachedSnapshot(true);
        if (!isIgnorableFetchError(err)) {
          setError(friendlyFetchMessageFromError(err));
        }
      } else if (!isIgnorableFetchError(err)) {
        setError(friendlyFetchMessageFromError(err));
      }
    } finally {
      if (generation.current === current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  return {
    data,
    meta,
    error,
    loading,
    refreshing,
    showingCachedSnapshot,
    refresh: () => load(true),
  };
}
