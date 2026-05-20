"use client";

import { cacheKey, fetchCachedJson, invalidateCached, LONG_CLIENT_CACHE_TTL_MS } from "@/lib/client-api-cache";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import {
  filterOpportunitiesByTerritory,
  parseMelOpportunities,
} from "@/lib/mel-matching/mel-opportunity-parser";
import type { MelProjectsDataResult } from "@/lib/mel-projects-sheet";
import { fetchWithTimeout, DASHBOARD_REQUEST_TIMEOUT_MS, isTimeoutError } from "@/lib/fetch-with-timeout";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type UseMelOpportunitiesOptions = {
  enabled?: boolean;
};

async function fetchMelSheet(signal?: AbortSignal): Promise<MelProjectsDataResult> {
  const res = await fetchWithTimeout("/api/mel-projects", {
    cache: "no-store",
    timeoutMs: DASHBOARD_REQUEST_TIMEOUT_MS,
    signal,
  });
  return (await res.json()) as MelProjectsDataResult;
}

export function useMelOpportunities(
  territoryStates?: string[],
  options: UseMelOpportunitiesOptions = {},
) {
  const enabled = options.enabled ?? true;
  const territoryKey = territoryStates?.slice().sort().join(",") ?? "all";
  const [raw, setRaw] = useState<MelProjectsDataResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchGeneration = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  const load = useCallback(
    async (force = false) => {
      if (!enabled) return;

      const generation = fetchGeneration.current + 1;
      fetchGeneration.current = generation;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setError(null);

      try {
        const parsed = await fetchCachedJson(
          cacheKey(["mel-projects", "sheet"]),
          () => fetchMelSheet(controller.signal),
          { ttlMs: LONG_CLIENT_CACHE_TTL_MS, force, label: "mel-projects" },
        );
        if (!mountedRef.current || generation !== fetchGeneration.current) return;
        if (!parsed.ok) {
          setError(parsed.error ?? "MEL sheet unavailable");
          return;
        }
        setRaw(parsed);
      } catch (err) {
        if (!mountedRef.current || generation !== fetchGeneration.current) return;
        setError(
          isTimeoutError(err)
            ? "MEL projects request timed out"
            : "Unable to load MEL projects",
        );
      } finally {
        if (!mountedRef.current || generation !== fetchGeneration.current) return;
        setLoading(false);
      }
    },
    [enabled],
  );

  useEffect(() => {
    mountedRef.current = true;
    if (!enabled) {
      queueMicrotask(() => {
        if (mountedRef.current) setLoading(false);
      });
      return () => {
        mountedRef.current = false;
        abortRef.current?.abort();
      };
    }

    queueMicrotask(() => {
      if (mountedRef.current) void load(false);
    });

    return () => {
      mountedRef.current = false;
      fetchGeneration.current += 1;
      abortRef.current?.abort();
    };
  }, [enabled, load, territoryKey]);

  const opportunities = useMemo((): MelOpportunity[] => {
    if (!raw?.ok) return [];
    const all = parseMelOpportunities(raw.rows);
    return filterOpportunitiesByTerritory(all, territoryStates);
  }, [raw, territoryStates]);

  return {
    opportunities,
    loading,
    error,
    refresh: () => {
      invalidateCached(cacheKey(["mel-projects", "sheet"]));
      void load(true);
    },
  };
}
