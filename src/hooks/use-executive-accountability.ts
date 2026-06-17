"use client";

import { cacheKey, fetchCachedJson, invalidateCached, LONG_CLIENT_CACHE_TTL_MS } from "@/lib/client-api-cache";
import type {
  ExecutiveAccountabilitySnapshot,
  ExecutiveActionStatus,
  OperationalEvidenceKind,
} from "@/lib/executive-accountability/types";
import { fetchWithTimeout, HEAVY_REQUEST_TIMEOUT_MS, isTimeoutError } from "@/lib/fetch-with-timeout";
import { useCallback, useEffect, useRef, useState } from "react";

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);
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
    try {
      const data = await fetchCachedJson(
        cacheKey(["executive-accountability"]),
        () => fetchExecutiveAccountability(controller.signal),
        { ttlMs: LONG_CLIENT_CACHE_TTL_MS, force, label: "executive-accountability" },
      );
      if (!mountedRef.current || generation !== fetchGeneration.current) return;
      setSnapshot(data);
    } catch (err) {
      if (!mountedRef.current || generation !== fetchGeneration.current) return;
      if (isTimeoutError(err)) {
        setTimedOut(true);
        setError("Accountability request timed out. Try again.");
      } else {
        setError(err instanceof Error ? err.message : "Unable to load executive accountability");
      }
    } finally {
      if (!mountedRef.current || generation !== fetchGeneration.current) return;
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(() => {
    invalidateCached(cacheKey(["executive-accountability"]));
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
        invalidateCached(cacheKey(["executive-accountability"]));
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

  return { snapshot, loading, error, timedOut, refresh, updateAction, updatingId };
}
