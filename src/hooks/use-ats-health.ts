"use client";

import type { AtsHealthSnapshot } from "@/lib/reliability/ats-health";
import { useCallback, useEffect, useRef, useState } from "react";

const BASE_REFRESH_MS = 5 * 60 * 1000;
const MAX_BACKOFF_STEPS = 4;

export function useAtsHealth() {
  const [snapshot, setSnapshot] = useState<AtsHealthSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const backoffStep = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/reliability/ats-health", { cache: "no-store" });
      const data = (await res.json()) as AtsHealthSnapshot;
      if (!res.ok) {
        throw new Error("Failed to load ATS health");
      }
      setSnapshot(data);
      backoffStep.current = 0;
    } catch (err) {
      const message = err instanceof Error ? err.message : "ATS health unavailable";
      setError(message);
      backoffStep.current = Math.min(backoffStep.current + 1, MAX_BACKOFF_STEPS);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const scheduleRefresh = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const delay = BASE_REFRESH_MS * 2 ** backoffStep.current;
    timerRef.current = setTimeout(() => {
      void load().finally(() => scheduleRefresh());
    }, delay);
  }, [load]);

  useEffect(() => {
    void load();
    scheduleRefresh();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [load, scheduleRefresh]);

  return {
    snapshot,
    error,
    loading,
    refreshing,
    refresh: () => load(true),
  };
}
