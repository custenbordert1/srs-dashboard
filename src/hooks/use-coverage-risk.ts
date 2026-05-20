"use client";

import type { CoverageRiskSnapshot } from "@/lib/coverage-risk-engine";
import { fetchWithRetry } from "@/lib/fetch-with-retry";
import { useCallback, useEffect, useState } from "react";

export function useCoverageRisk() {
  const [snapshot, setSnapshot] = useState<CoverageRiskSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithRetry("/api/coverage-risk", { cache: "no-store" });
      const parsed = (await res.json()) as {
        ok?: boolean;
        snapshot?: CoverageRiskSnapshot;
        error?: string;
      };
      if (!parsed.ok || !parsed.snapshot) {
        setError(parsed.error ?? "Unable to load coverage risk intelligence");
        return;
      }
      setSnapshot(parsed.snapshot);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load coverage risk intelligence");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetchWithRetry("/api/coverage-risk", { cache: "no-store" });
        const parsed = (await res.json()) as {
          ok?: boolean;
          snapshot?: CoverageRiskSnapshot;
          error?: string;
        };
        if (cancelled) return;
        if (!parsed.ok || !parsed.snapshot) {
          setError(parsed.error ?? "Unable to load coverage risk intelligence");
          return;
        }
        setSnapshot(parsed.snapshot);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unable to load coverage risk intelligence");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    snapshot,
    loading,
    error,
    refresh: () => void load(),
  };
}
