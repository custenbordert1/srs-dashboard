"use client";

import type { P170SearchResult } from "@/lib/p170-unified-candidate-discovery/types";
import { useCallback, useRef, useState } from "react";

export function useCandidateDiscovery() {
  const [result, setResult] = useState<P170SearchResult | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastQuery, setLastQuery] = useState("");
  const requestSeq = useRef(0);

  const search = useCallback(async (query: string) => {
    const trimmed = query.trim();
    setLastQuery(trimmed);
    if (!trimmed) {
      setResult(null);
      setWarnings([]);
      setError(null);
      return;
    }

    const seq = ++requestSeq.current;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/recruiting/candidate-discovery/search?q=${encodeURIComponent(trimmed)}`,
        { cache: "no-store" },
      );
      const data = (await res.json()) as {
        ok?: boolean;
        result?: P170SearchResult;
        warnings?: string[];
        error?: string;
      };
      // Ignore stale responses from superseded requests.
      if (seq !== requestSeq.current) return;
      if (!res.ok || !data.ok || !data.result) {
        setError(data.error ?? "Discovery search failed");
        setResult(null);
        return;
      }
      setResult(data.result);
      setWarnings(data.warnings ?? data.result.warnings ?? []);
    } catch (e) {
      if (seq !== requestSeq.current) return;
      setError(e instanceof Error ? e.message : "Discovery search failed");
      setResult(null);
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, []);

  const clear = useCallback(() => {
    requestSeq.current += 1;
    setResult(null);
    setWarnings([]);
    setError(null);
    setLastQuery("");
    setLoading(false);
  }, []);

  return { result, warnings, loading, error, lastQuery, search, clear };
}
