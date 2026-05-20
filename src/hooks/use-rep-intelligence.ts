"use client";

import { cacheKey, fetchCachedJson, LONG_CLIENT_CACHE_TTL_MS } from "@/lib/client-api-cache";
import type { RepIntelligenceSnapshot } from "@/lib/rep-intelligence/rep-types";
import { useCallback, useEffect, useRef, useState } from "react";

type UseRepIntelligenceOptions = {
  enabled?: boolean;
};

async function fetchRepIntelligence(): Promise<RepIntelligenceSnapshot> {
  const res = await fetch("/api/rep-intelligence", { cache: "no-store" });
  const parsed = (await res.json()) as {
    ok?: boolean;
    snapshot?: RepIntelligenceSnapshot;
    error?: string;
  };
  if (!parsed.ok || !parsed.snapshot) {
    throw new Error(parsed.error ?? "Unable to load rep intelligence");
  }
  return parsed.snapshot;
}

export function useRepIntelligence(options: UseRepIntelligenceOptions = {}) {
  const enabled = options.enabled ?? true;
  const [snapshot, setSnapshot] = useState<RepIntelligenceSnapshot | null>(null);
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
          cacheKey(["rep-intelligence"]),
          fetchRepIntelligence,
          { ttlMs: LONG_CLIENT_CACHE_TTL_MS, force, label: "rep-intelligence" },
        );
        if (mounted.current) setSnapshot(data);
      } catch (err) {
        if (mounted.current) {
          setError(err instanceof Error ? err.message : "Unable to load rep intelligence");
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
