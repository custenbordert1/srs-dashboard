"use client";

import { fetchWithRetry } from "@/lib/fetch-with-retry";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import {
  filterOpportunitiesByTerritory,
  parseMelOpportunities,
} from "@/lib/mel-matching/mel-opportunity-parser";
import type { MelProjectsDataResult } from "@/lib/mel-projects-sheet";
import { useEffect, useState } from "react";

export function useMelOpportunities(territoryStates?: string[]) {
  const [opportunities, setOpportunities] = useState<MelOpportunity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void fetchWithRetry("/api/mel-projects", { cache: "no-store" })
      .then((res) => res.json())
      .then((parsed: MelProjectsDataResult) => {
        if (cancelled || !parsed.ok) return;
        const all = parseMelOpportunities(parsed.rows);
        setOpportunities(filterOpportunitiesByTerritory(all, territoryStates));
      })
      .catch(() => {
        /* optional sheet */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [territoryStates]);

  return { opportunities, loading };
}
