"use client";

import { useCallback, useEffect, useState } from "react";
import type { PipelineAdvancementSummary } from "@/lib/p151-autonomous-candidate-advancement/types";

type PipelineAdvancementResponse = {
  ok: boolean;
  report: PipelineAdvancementSummary;
  meta: { p151Enabled: boolean; dryRun: boolean };
  error?: string;
};

export function useCandidatePipelineAdvancement() {
  const [report, setReport] = useState<PipelineAdvancementSummary | null>(null);
  const [meta, setMeta] = useState<PipelineAdvancementResponse["meta"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const response = await fetch("/api/recruiting/candidate-pipeline-advancement");
      const data = (await response.json()) as PipelineAdvancementResponse;
      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? "Failed to load pipeline advancement report.");
      }
      setReport(data.report);
      setMeta(data.meta);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load pipeline advancement.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const executeLive = useCallback(async () => {
    setExecuting(true);
    setError(null);
    try {
      const response = await fetch("/api/recruiting/candidate-pipeline-advancement", { method: "POST" });
      const data = (await response.json()) as PipelineAdvancementResponse;
      if (!response.ok) {
        throw new Error(data.error ?? "Live advancement blocked.");
      }
      setReport(data.report);
      setMeta(data.meta);
      if (!data.ok) {
        setError("Pipeline execution completed with failures — review execution items.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Live advancement failed.");
    } finally {
      setExecuting(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    report,
    meta,
    loading,
    refreshing,
    executing,
    error,
    refresh,
    executeLive,
  };
}
