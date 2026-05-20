"use client";

import type { RecruitingIntelligenceSnapshot } from "@/lib/recruiting-automation";
import { fetchJsonWithRetry } from "@/hooks/use-fetch-with-retry";
import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_POLL_MS = 90_000;

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

    const result = await fetchJsonWithRetry<IntelligenceResponse>("/api/recruiting/intelligence");
    if (!result.ok) {
      setError(result.error);
      if (!soft) setData(null);
    } else {
      const parsed = result.data;
      if (!parsed.ok || !parsed.intelligence) {
        setError(parsed.error ?? "Failed to load recruiting intelligence");
        if (!soft) setData(null);
      } else {
        setData(parsed.intelligence);
        setMeta(parsed.meta);
        initialDone.current = true;
      }
    }

    setLoading(false);
    setRefreshing(false);
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
