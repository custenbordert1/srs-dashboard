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
import type { P1681ExecutiveDecisionCenterView } from "@/lib/p168.1-executive-decision-center/types";
import { P161_CLIENT_SECTION_TIMEOUT_MS } from "@/lib/app-loading-reliability/constants";
import { EXECUTIVE_PANEL_LOADING_CEILING_MS, useLoadingCeiling } from "@/hooks/use-loading-ceiling";
import {
  useSnapshotRefreshPoll,
  type ExecutiveSnapshotClientMeta,
} from "@/hooks/use-snapshot-refresh-poll";
import { useCallback, useEffect, useRef, useState } from "react";

const CACHE_KEY = cacheKey(["p168.1", "executive-decision-center"]);

function readCache(): P1681ExecutiveDecisionCenterView | null {
  if (typeof window === "undefined") return null;
  return getCachedAllowExpired<P1681ExecutiveDecisionCenterView>(CACHE_KEY);
}

export function useExecutiveDecisionCenter() {
  const initial = readCache();
  const [view, setView] = useState<P1681ExecutiveDecisionCenterView | null>(initial);
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
      const res = await fetchWithTimeout("/api/recruiting/executive-decision-center", {
        cache: "no-store",
        timeoutMs: P161_CLIENT_SECTION_TIMEOUT_MS,
      });
      const parsed = (await res.json()) as {
        view?: P1681ExecutiveDecisionCenterView;
        meta?: ExecutiveSnapshotClientMeta;
        error?: string;
      };
      if (!res.ok || !parsed.view) {
        throw new Error(parsed.error ?? `Executive decision center failed (${res.status})`);
      }
      if (!mountedRef.current || generationRef.current !== generation) return;
      setView(parsed.view);
      setMeta(parsed.meta ?? null);
      setShowingCachedSnapshot(false);
      setCached(CACHE_KEY, parsed.view, LONG_CLIENT_CACHE_TTL_MS);
    } catch (err) {
      if (!mountedRef.current || generationRef.current !== generation) return;
      const cached = readCache();
      if (cached) {
        setView(cached);
        setShowingCachedSnapshot(true);
        setError(
          isTimeoutError(err)
            ? timeoutErrorMessage("Executive decision center", P161_CLIENT_SECTION_TIMEOUT_MS)
            : friendlyFetchMessageFromError(err, "dashboard") ?? "Decision center unavailable",
        );
      } else if (!isIgnorableFetchError(err)) {
        setError(friendlyFetchMessageFromError(err, "dashboard") ?? "Decision center unavailable");
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

  const loadingCeilingHit = useLoadingCeiling(loading && !view, EXECUTIVE_PANEL_LOADING_CEILING_MS);

  return {
    view,
    error,
    loading: loading && !view && !loadingCeilingHit,
    loadingCeilingHit,
    showingCachedSnapshot,
    meta,
    refresh,
  };
}
