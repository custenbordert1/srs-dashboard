"use client";

import { friendlyFetchMessageFromError } from "@/lib/friendly-fetch-errors";
import type { PipelineIntelligenceSnapshot } from "@/lib/pipeline-intelligence";
import { useCallback, useEffect, useState } from "react";

type PipelineResponse = {
  ok: boolean;
  error?: string;
  snapshot?: PipelineIntelligenceSnapshot;
  meta?: {
    partialSync?: boolean;
    totalCandidates?: number;
    refreshedAt?: string;
  };
};

export function usePipelineIntelligence() {
  const [data, setData] = useState<PipelineIntelligenceSnapshot | null>(null);
  const [meta, setMeta] = useState<PipelineResponse["meta"]>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/pipeline-intelligence", { cache: "no-store" });
      const parsed = (await res.json()) as PipelineResponse;
      if (!res.ok || !parsed.ok || !parsed.snapshot) {
        throw new Error(parsed.error ?? "Failed to load pipeline intelligence");
      }
      setData(parsed.snapshot);
      setMeta(parsed.meta);
    } catch (err) {
      setError(
        friendlyFetchMessageFromError(err, "dashboard") ??
          "Pipeline intelligence temporarily unavailable.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    data,
    meta,
    error,
    loading,
    refreshing,
    refresh: () => load(true),
  };
}
