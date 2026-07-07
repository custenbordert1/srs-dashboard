"use client";

import {
  cacheKey,
  getCachedAllowExpired,
  LONG_CLIENT_CACHE_TTL_MS,
  setCached,
} from "@/lib/client-api-cache";
import { friendlyFetchMessageFromError, isIgnorableFetchError } from "@/lib/friendly-fetch-errors";
import {
  fetchWithTimeout,
  isTimeoutError,
  timeoutErrorMessage,
} from "@/lib/fetch-with-timeout";
import type { P160ProductionReadinessReport, P160ReadinessLevel } from "@/lib/p160-production-readiness/types";
import { EXECUTIVE_PANEL_LOADING_CEILING_MS, useLoadingCeiling } from "@/hooks/use-loading-ceiling";
import { useCallback, useEffect, useRef, useState } from "react";

const CACHE_KEY = cacheKey(["p160", "production-readiness"]);
const REQUEST_TIMEOUT_MS = 30_000;

function readCache(): P160ProductionReadinessReport | null {
  if (typeof window === "undefined") return null;
  return getCachedAllowExpired<P160ProductionReadinessReport>(CACHE_KEY);
}

export function useProductionReadiness() {
  const initial = readCache();
  const [report, setReport] = useState<P160ProductionReadinessReport | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!initial);
  const [showingCachedSnapshot, setShowingCachedSnapshot] = useState(Boolean(initial));

  const mountedRef = useRef(true);
  const generationRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    setLoading(true);
    setError(null);

    try {
      const res = await fetchWithTimeout("/api/recruiting/production-readiness", {
        cache: "no-store",
        timeoutMs: REQUEST_TIMEOUT_MS,
      });
      const parsed = (await res.json()) as { report?: P160ProductionReadinessReport; error?: string };
      if (!res.ok || !parsed.report) {
        throw new Error(parsed.error ?? `Production readiness failed (${res.status})`);
      }
      if (!mountedRef.current || generationRef.current !== generation) return;
      setReport(parsed.report);
      setShowingCachedSnapshot(false);
      setCached(CACHE_KEY, parsed.report, LONG_CLIENT_CACHE_TTL_MS);
    } catch (err) {
      if (!mountedRef.current || generationRef.current !== generation) return;
      const cached = readCache();
      if (cached) {
        setReport(cached);
        setShowingCachedSnapshot(true);
        setError(
          isTimeoutError(err)
            ? timeoutErrorMessage("Production readiness", REQUEST_TIMEOUT_MS)
            : friendlyFetchMessageFromError(err, "dashboard") ?? "Readiness check unavailable",
        );
      } else if (!isIgnorableFetchError(err)) {
        setError(friendlyFetchMessageFromError(err, "dashboard") ?? "Readiness check unavailable");
      }
    } finally {
      if (mountedRef.current && generationRef.current === generation) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const loadingCeilingHit = useLoadingCeiling(loading && !report, EXECUTIVE_PANEL_LOADING_CEILING_MS);

  return { report, error, loading: loading && !report && !loadingCeilingHit, loadingCeilingHit, showingCachedSnapshot, refresh };
}

export function levelTone(level: P160ReadinessLevel): "success" | "warning" | "critical" | "neutral" {
  if (level === "ready") return "success";
  if (level === "warning") return "warning";
  if (level === "blocked") return "critical";
  return "neutral";
}
