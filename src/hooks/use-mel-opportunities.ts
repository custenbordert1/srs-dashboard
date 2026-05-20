"use client";

import { cacheKey, fetchCachedJson, LONG_CLIENT_CACHE_TTL_MS } from "@/lib/client-api-cache";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import {
  filterOpportunitiesByTerritory,
  parseMelOpportunities,
} from "@/lib/mel-matching/mel-opportunity-parser";
import type { MelProjectsDataResult } from "@/lib/mel-projects-sheet";
import { useCallback, useEffect, useMemo, useState } from "react";

type UseMelOpportunitiesOptions = {
  enabled?: boolean;
};

async function fetchMelSheet(): Promise<MelProjectsDataResult> {
  const res = await fetch("/api/mel-projects", { cache: "no-store" });
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

  const load = useCallback(
    async (force = false) => {
      if (!enabled) return;
      setLoading(true);
      setError(null);
      try {
        const parsed = await fetchCachedJson(
          cacheKey(["mel-projects", "sheet"]),
          fetchMelSheet,
          { ttlMs: LONG_CLIENT_CACHE_TTL_MS, force, label: "mel-projects" },
        );
        if (!parsed.ok) {
          setError(parsed.error ?? "MEL sheet unavailable");
          return;
        }
        setRaw(parsed);
      } catch {
        setError("Unable to load MEL projects");
      } finally {
        setLoading(false);
      }
    },
    [enabled],
  );

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void load(false);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, load, territoryKey]);

  const opportunities = useMemo((): MelOpportunity[] => {
    if (!raw?.ok) return [];
    const all = parseMelOpportunities(raw.rows);
    return filterOpportunitiesByTerritory(all, territoryStates);
  }, [raw, territoryStates]);

  return { opportunities, loading, error, refresh: () => void load(true) };
}
