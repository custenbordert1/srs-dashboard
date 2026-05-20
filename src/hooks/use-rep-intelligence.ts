"use client";

import type { RepIntelligenceSnapshot } from "@/lib/rep-intelligence/rep-types";
import { fetchWithRetry } from "@/lib/fetch-with-retry";
import { useEffect, useState } from "react";

export function useRepIntelligence() {
  const [snapshot, setSnapshot] = useState<RepIntelligenceSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void fetchWithRetry("/api/rep-intelligence", { cache: "no-store" })
      .then((res) => res.json())
      .then((parsed: { ok?: boolean; snapshot?: RepIntelligenceSnapshot; error?: string }) => {
        if (cancelled) return;
        if (!parsed.ok || !parsed.snapshot) {
          setError(parsed.error ?? "Unable to load rep intelligence");
          return;
        }
        setSnapshot(parsed.snapshot);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unable to load rep intelligence");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tick]);

  return {
    snapshot,
    loading,
    error,
    refresh: () => {
      setLoading(true);
      setTick((n) => n + 1);
    },
  };
}
