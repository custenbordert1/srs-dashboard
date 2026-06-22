"use client";

import { cacheKey, fetchCachedJson, getCachedAllowExpired, invalidateCached, LONG_CLIENT_CACHE_TTL_MS } from "@/lib/client-api-cache";
import { executivePanelErrorMessage, isIgnorableFetchError } from "@/lib/executive-panel-messages";
import type {
  ExecutiveAccountabilitySnapshot,
  ExecutiveActionStatus,
  OperationalEvidenceKind,
} from "@/lib/executive-accountability/types";
import {
  fetchWithTimeout,
  HEAVY_REQUEST_TIMEOUT_MS,
  isAbortError,
  isTimeoutError,
} from "@/lib/fetch-with-timeout";
import { useCallback, useEffect, useRef, useState } from "react";

const ACCOUNTABILITY_CACHE_KEY = cacheKey(["executive-accountability"]);

async function fetchExecutiveAccountability(signal?: AbortSignal): Promise<ExecutiveAccountabilitySnapshot> {
  const res = await fetchWithTimeout("/api/executive-accountability", {
    cache: "no-store",
    timeoutMs: HEAVY_REQUEST_TIMEOUT_MS,
    signal,
  });
  const parsed = (await res.json()) as {
    ok?: boolean;
    snapshot?: ExecutiveAccountabilitySnapshot;
    error?: string;
  };
  if (!parsed.ok || !parsed.snapshot) {
    throw new Error(parsed.error ?? "Unable to load executive accountability");
  }
  return parsed.snapshot;
}

export type ExecutiveActionUpdateInput = {
  recommendationId: string;
  status?: ExecutiveActionStatus;
  owner?: string | null;
  dueDate?: string;
  outcomeNotes?: string | null;
  appendNote?: string;
  operationalEvidenceKind?: OperationalEvidenceKind;
  operationalEvidenceDetail?: string | null;
};

export function useExecutiveAccountability() {
  const [snapshot, setSnapshot] = useState<ExecutiveAccountabilitySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [showingCachedSnapshot, setShowingCachedSnapshot] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const fetchGeneration = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  const load = useCallback(async (force = false) => {
    const generation = fetchGeneration.current + 1;
    fetchGeneration.current = generation;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    setTimedOut(false);
    setShowingCachedSnapshot(false);
    try {
      const data = await fetchCachedJson(
        ACCOUNTABILITY_CACHE_KEY,
        () => fetchExecutiveAccountability(controller.signal),
        {
          ttlMs: LONG_CLIENT_CACHE_TTL_MS,
          force,
          label: "executive-accountability",
          staleOnError: true,
        },
      );
      if (!mountedRef.current || generation !== fetchGeneration.current) return;
      setSnapshot(data);
    } catch (err) {
      if (!mountedRef.current || generation !== fetchGeneration.current) return;
      if (isIgnorableFetchError(err) || isAbortError(err)) return;

      const stale = getCachedAllowExpired<ExecutiveAccountabilitySnapshot>(ACCOUNTABILITY_CACHE_KEY);
      if (stale) {
        setSnapshot(stale);
        setShowingCachedSnapshot(true);
        const friendly = executivePanelErrorMessage("accountability", err, {
          showingCachedSnapshot: true,
        });
        setError(friendly.message);
        setTimedOut(friendly.timedOut);
        return;
      }

      const friendly = executivePanelErrorMessage("accountability", err);
      setTimedOut(friendly.timedOut || isTimeoutError(err));
      setError(friendly.message);
    } finally {
      if (!mountedRef.current || generation !== fetchGeneration.current) return;
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(() => {
    invalidateCached(ACCOUNTABILITY_CACHE_KEY);
    void load(true);
  }, [load]);

  const updateAction = useCallback(
    async (input: ExecutiveActionUpdateInput) => {
      setUpdatingId(input.recommendationId);
      try {
        const res = await fetch("/api/executive-accountability", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        const parsed = (await res.json()) as { ok?: boolean; error?: string };
        if (!parsed.ok) {
          throw new Error(parsed.error ?? "Update failed");
        }
        invalidateCached(ACCOUNTABILITY_CACHE_KEY);
        await load(true);
      } finally {
        setUpdatingId(null);
      }
    },
    [load],
  );

  useEffect(() => {
    mountedRef.current = true;
    queueMicrotask(() => {
      if (mountedRef.current) void load(false);
    });
    return () => {
      mountedRef.current = false;
      fetchGeneration.current += 1;
      abortRef.current?.abort();
    };
  }, [load]);

  return {
    snapshot,
    loading,
    error,
    timedOut,
    showingCachedSnapshot,
    refresh,
    updateAction,
    updatingId,
  };
}
