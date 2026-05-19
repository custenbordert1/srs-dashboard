"use client";

import type { RecruitingIntelligenceSnapshot } from "@/lib/recruiting-automation";
import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_POLL_MS = 120_000;

type IntelligenceMeta = {
  partialSync?: boolean;
  filteredJobs?: number;
  filteredCandidates?: number;
  refreshedAt?: string;
};

type IntelligenceResponse = {
  ok: boolean;
  error?: string;
  intelligence?: RecruitingIntelligenceSnapshot;
  meta?: IntelligenceMeta;
};

export function useRecruitingIntelligence(pollIntervalMs = DEFAULT_POLL_MS) {
  const [data, setData] = useState<RecruitingIntelligenceSnapshot | null>(null);
  const [meta, setMeta] = useState<IntelligenceMeta>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const initialDone = useRef(false);

  const fetchIntelligence = useCallback(async (soft: boolean) => {
    if (soft) setRefreshing(true);
    else if (!initialDone.current) setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/recruiting/intelligence", { cache: "no-store" });
      const parsed = (await res.json()) as IntelligenceResponse;
      if (!res.ok || !parsed.ok || !parsed.intelligence) {
        setError(parsed.error ?? "Failed to load recruiting intelligence");
        if (!soft) setData(null);
        return;
      }
      setData(parsed.intelligence);
      setMeta(parsed.meta);
      initialDone.current = true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load recruiting intelligence");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const refresh = useCallback(() => {
    void fetchIntelligence(true);
  }, [fetchIntelligence]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      await fetchIntelligence(false);
      if (cancelled) return;
    })();

    const interval = window.setInterval(() => {
      void fetchIntelligence(true);
    }, pollIntervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [fetchIntelligence, pollIntervalMs]);

  return { data, meta, error, loading, refreshing, refresh };
}
