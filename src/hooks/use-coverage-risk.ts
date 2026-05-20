"use client";

import { cacheKey, fetchCachedJson, LONG_CLIENT_CACHE_TTL_MS } from "@/lib/client-api-cache";
import type { CoverageRiskSnapshot } from "@/lib/coverage-risk-engine";
import { useCallback, useEffect, useRef, useState } from "react";

type UseCoverageRiskOptions = {
  enabled?: boolean;
};

async function fetchCoverageRisk(): Promise<CoverageRiskSnapshot> {
  const res = await fetch("/api/coverage-risk", { cache: "no-store" });
  const parsed = (await res.json()) as {
    ok?: boolean;
    snapshot?: CoverageRiskSnapshot;
    error?: string;
  };
  if (!parsed.ok || !parsed.snapshot) {
    throw new Error(parsed.error ?? "Unable to load coverage risk intelligence");
  }
  return parsed.snapshot;
}

export function useCoverageRisk(options: UseCoverageRiskOptions = {}) {
  const enabled = options.enabled ?? true;
  const [snapshot, setSnapshot] = useState<CoverageRiskSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const load = useCallback(
    async (force = false) => {
      if (!enabled) return;
      setLoading(true);
      setError(null);
      try {
        const data = await fetchCachedJson(
          cacheKey(["coverage-risk"]),
          fetchCoverageRisk,
          { ttlMs: LONG_CLIENT_CACHE_TTL_MS, force, label: "coverage-risk" },
        );
        if (mounted.current) setSnapshot(data);
      } catch (err) {
        if (mounted.current) {
          setError(err instanceof Error ? err.message : "Unable to load coverage risk intelligence");
        }
      } finally {
        if (mounted.current) setLoading(false);
      }
    },
    [enabled],
  );

  useEffect(() => {
    mounted.current = true;
    if (!enabled) {
      return () => {
        mounted.current = false;
      };
    }
    queueMicrotask(() => {
      if (mounted.current) void load(false);
    });
    return () => {
      mounted.current = false;
    };
  }, [enabled, load]);

  return {
    snapshot,
    loading,
    error,
    refresh: () => void load(true),
  };
}
