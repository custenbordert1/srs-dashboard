"use client";

import {
  cacheKey,
  fetchCachedJson,
  getCached,
  getCachedAllowExpired,
  invalidateCached,
  LONG_CLIENT_CACHE_TTL_MS,
} from "@/lib/client-api-cache";
import type { AutonomousRecruitingSnapshot, ApprovalRule } from "@/lib/autonomous-recruiting-engine";
import { friendlyFetchMessageFromError, isIgnorableFetchError } from "@/lib/friendly-fetch-errors";
import {
  fetchWithTimeout,
  HEAVY_REQUEST_TIMEOUT_MS,
  isAbortError,
  isTimeoutError,
} from "@/lib/fetch-with-timeout";
import { useCallback, useEffect, useRef, useState } from "react";

const AUTOPILOT_CACHE_KEY = cacheKey(["autonomous-recruiting"]);

type AutonomousRecruitingResponse = {
  ok: boolean;
  error?: string;
  snapshot?: AutonomousRecruitingSnapshot;
  rules?: ApprovalRule[];
};

function readAutopilotCache(): AutonomousRecruitingSnapshot | null {
  return getCachedAllowExpired<AutonomousRecruitingSnapshot>(AUTOPILOT_CACHE_KEY);
}

async function fetchAutonomousRecruiting(signal?: AbortSignal): Promise<AutonomousRecruitingSnapshot> {
  const res = await fetchWithTimeout("/api/autonomous-recruiting", {
    cache: "no-store",
    timeoutMs: HEAVY_REQUEST_TIMEOUT_MS,
    signal,
  });
  const parsed = (await res.json()) as AutonomousRecruitingResponse;
  if (!parsed.ok || !parsed.snapshot) {
    throw new Error(parsed.error ?? "Unable to load recruiting autopilot");
  }
  return parsed.snapshot;
}

export function useAutonomousRecruiting(options: { enabled?: boolean } = {}) {
  const enabled = options.enabled ?? true;
  const initialCache = typeof window !== "undefined" ? readAutopilotCache() : null;
  const [snapshot, setSnapshot] = useState<AutonomousRecruitingSnapshot | null>(initialCache);
  const [loading, setLoading] = useState(enabled && !initialCache);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [showingCachedSnapshot, setShowingCachedSnapshot] = useState(false);
  const [savingRules, setSavingRules] = useState(false);

  const fetchGeneration = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  const load = useCallback(
    async (manual = false) => {
      if (!enabled) return;

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
      } else if (!getCached<AutonomousRecruitingSnapshot>(AUTOPILOT_CACHE_KEY)) {
        setLoading(true);
      }
      setError(null);
      setTimedOut(false);

      try {
        const data = await fetchCachedJson(
          AUTOPILOT_CACHE_KEY,
          () => fetchAutonomousRecruiting(signal),
          {
            ttlMs: LONG_CLIENT_CACHE_TTL_MS,
            force: manual,
            label: "autonomous-recruiting",
            staleOnError: true,
            shouldCache: (payload) => Boolean(payload.fetchedAt),
          },
        );
        if (!mountedRef.current || generation !== fetchGeneration.current) return;
        setSnapshot(data);
        setShowingCachedSnapshot(false);
      } catch (err) {
        if (!mountedRef.current || generation !== fetchGeneration.current) return;

        const stale = readAutopilotCache();
        if (stale) {
          setSnapshot(stale);
          setShowingCachedSnapshot(true);
          if (!isIgnorableFetchError(err) && !isAbortError(err)) {
            setError(
              friendlyFetchMessageFromError(err, "autopilot") ??
                "Recruiting autopilot temporarily unavailable. Showing last loaded snapshot.",
            );
          }
          return;
        }

        if (isIgnorableFetchError(err) || isAbortError(err)) {
          return;
        }

        if (isTimeoutError(err)) {
          setTimedOut(true);
          setError("Recruiting autopilot request timed out. Try again.");
          return;
        }

        setError(
          friendlyFetchMessageFromError(err, "autopilot") ??
            (err instanceof Error ? err.message : "Unable to load recruiting autopilot"),
        );
      } finally {
        if (!mountedRef.current || generation !== fetchGeneration.current) return;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [enabled],
  );

  const refresh = useCallback(() => {
    invalidateCached(AUTOPILOT_CACHE_KEY);
    void load(true);
  }, [load]);

  const saveRules = useCallback(
    async (rules: ApprovalRule[]) => {
      setSavingRules(true);
      setError(null);
      try {
        const res = await fetchWithTimeout("/api/autonomous-recruiting", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "refresh-rules", rules }),
          timeoutMs: HEAVY_REQUEST_TIMEOUT_MS,
        });
        const parsed = (await res.json()) as AutonomousRecruitingResponse;
        if (!parsed.ok) throw new Error(parsed.error ?? "Failed to save approval rules");
        refresh();
      } catch (err) {
        if (!isIgnorableFetchError(err) && !isAbortError(err)) {
          setError(err instanceof Error ? err.message : "Failed to save approval rules");
        }
      } finally {
        setSavingRules(false);
      }
    },
    [refresh],
  );

  const evaluateRules = useCallback(async () => {
    setSavingRules(true);
    setError(null);
    try {
      const res = await fetchWithTimeout("/api/autonomous-recruiting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "evaluate-rules" }),
        timeoutMs: HEAVY_REQUEST_TIMEOUT_MS,
      });
      const parsed = (await res.json()) as AutonomousRecruitingResponse;
      if (!parsed.ok || !parsed.snapshot) {
        throw new Error(parsed.error ?? "Failed to evaluate approval rules");
      }
      invalidateCached(AUTOPILOT_CACHE_KEY);
      setSnapshot(parsed.snapshot);
      setShowingCachedSnapshot(false);
    } catch (err) {
      if (!isIgnorableFetchError(err) && !isAbortError(err)) {
        setError(err instanceof Error ? err.message : "Failed to evaluate approval rules");
      }
    } finally {
      setSavingRules(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    if (!enabled) {
      queueMicrotask(() => {
        if (mountedRef.current) setLoading(false);
      });
      return () => {
        mountedRef.current = false;
        fetchGeneration.current += 1;
      };
    }

    queueMicrotask(() => {
      if (mountedRef.current) void load(false);
    });

    return () => {
      mountedRef.current = false;
      fetchGeneration.current += 1;
    };
  }, [enabled, load]);

  return {
    snapshot,
    loading,
    refreshing,
    error,
    timedOut,
    showingCachedSnapshot,
    refresh,
    saveRules,
    evaluateRules,
    savingRules,
  };
}
