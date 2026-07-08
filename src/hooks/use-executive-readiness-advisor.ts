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
import type { P1682ExecutiveReadinessAdvisorReport } from "@/lib/p168.2-executive-readiness-advisor/types";
import { P161_CLIENT_SECTION_TIMEOUT_MS } from "@/lib/app-loading-reliability/constants";
import { EXECUTIVE_PANEL_LOADING_CEILING_MS, useLoadingCeiling } from "@/hooks/use-loading-ceiling";
import {
  useSnapshotRefreshPoll,
  type ExecutiveSnapshotClientMeta,
} from "@/hooks/use-snapshot-refresh-poll";
import { useCallback, useEffect, useRef, useState } from "react";

const CACHE_KEY = cacheKey(["p168.2", "executive-readiness"]);

function readCache(): P1682ExecutiveReadinessAdvisorReport | null {
  if (typeof window === "undefined") return null;
  return getCachedAllowExpired<P1682ExecutiveReadinessAdvisorReport>(CACHE_KEY);
}

export function useExecutiveReadinessAdvisor() {
  const initial = readCache();
  const [report, setReport] = useState<P1682ExecutiveReadinessAdvisorReport | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!initial);
  const [showingCachedSnapshot, setShowingCachedSnapshot] = useState(Boolean(initial));
  const [meta, setMeta] = useState<ExecutiveSnapshotClientMeta | null>(null);

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
    setError(null);

    try {
      const res = await fetchWithTimeout("/api/recruiting/executive-readiness", {
        cache: "no-store",
        timeoutMs: P161_CLIENT_SECTION_TIMEOUT_MS,
      });
      const parsed = (await res.json()) as {
        report?: P1682ExecutiveReadinessAdvisorReport;
        meta?: ExecutiveSnapshotClientMeta;
        error?: string;
      };
      if (!res.ok || !parsed.report) {
        throw new Error(parsed.error ?? `Executive readiness failed (${res.status})`);
      }
      if (!mountedRef.current || generationRef.current !== generation) return;
      setReport(parsed.report);
      setMeta(parsed.meta ?? null);
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
            ? timeoutErrorMessage("Executive readiness", P161_CLIENT_SECTION_TIMEOUT_MS)
            : friendlyFetchMessageFromError(err, "dashboard") ?? "Readiness advisor unavailable",
        );
      } else if (!isIgnorableFetchError(err)) {
        setError(friendlyFetchMessageFromError(err, "dashboard") ?? "Readiness advisor unavailable");
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

  useSnapshotRefreshPoll(meta, () => void refresh());

  const loadingCeilingHit = useLoadingCeiling(loading && !report, EXECUTIVE_PANEL_LOADING_CEILING_MS);

  return {
    report,
    error,
    loading: loading && !report && !loadingCeilingHit,
    loadingCeilingHit,
    showingCachedSnapshot,
    meta,
    refresh,
  };
}
