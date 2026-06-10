"use client";

import type { SheetDataResult } from "@/lib/google-sheet-csv";
import { fetchRecruitingSheetData } from "@/lib/dashboard-api-client";
import { buildAtsHeadlineKpis } from "@/lib/breezy-ats-reporting";
import type { BreezyAtsMetrics } from "@/lib/breezy-ats-metrics";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { isGoogleSheetRecruitingLiveEnabledClient } from "@/lib/recruiting-data-architecture";
import type { Kpi } from "@/lib/recruiting-sample-data";
import {
  computeSheetKpiSnapshot,
  sheetSnapshotToKpis,
} from "@/lib/sheet-kpi-metrics";
import { useEffect, useMemo, useState } from "react";
import { KpiCards } from "./kpi-cards";

function KpiSkeletonGrid() {
  return (
    <section
      aria-labelledby="kpi-heading"
      aria-busy="true"
      className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
    >
      <h2 id="kpi-heading" className="sr-only">
        Key performance indicators
      </h2>
      {["a", "b", "c", "d"].map((k) => (
        <div
          key={k}
          className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 shadow-sm shadow-black/20 backdrop-blur-sm sm:p-5"
        >
          <div className="h-4 w-28 animate-pulse rounded bg-zinc-800/80" />
          <div className="mt-4 h-9 w-20 animate-pulse rounded bg-zinc-800/60" />
          <div className="mt-3 h-3 w-full max-w-[10rem] animate-pulse rounded bg-zinc-800/50" />
        </div>
      ))}
    </section>
  );
}

export function SheetKpiCards() {
  const sheetLive = isGoogleSheetRecruitingLiveEnabledClient();
  const [data, setData] = useState<SheetDataResult | undefined>(undefined);
  const [breezyKpis, setBreezyKpis] = useState<Kpi[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        if (!sheetLive) {
          const res = await fetchWithTimeout("/api/recruiting/ats-reporting", {
            timeoutMs: 15_000,
          });
          const parsed = (await res.json()) as { ok: boolean; ats?: BreezyAtsMetrics; error?: string };
          if (cancelled) return;
          if (parsed.ok && parsed.ats) {
            setBreezyKpis(buildAtsHeadlineKpis(parsed.ats));
            setData(undefined);
            return;
          }
          const err = parsed.error ?? "ATS reporting bundle unavailable";
          setLoadError(err);
          setBreezyKpis(buildAtsHeadlineKpis(
            {
              candidatesLoaded: 0,
              publishedJobs: 0,
              applicantsToday: 0,
              applicants7d: 0,
              positionsScanned: 0,
              totalPositionsAvailable: 0,
              positionsNotScanned: 0,
              scanMode: null,
              syncTier: "partial",
              partialSync: true,
              fromCache: false,
              stale: false,
              truncated: false,
              hydrationComplete: undefined,
              lastSuccessfulSync: new Date().toISOString(),
              lastSuccessfulSyncLabel: "—",
              partialReasons: [],
              ancillaryPartialErrors: [],
            },
            err,
          ));
          return;
        }

        const parsed = await fetchRecruitingSheetData();
        if (!cancelled) setData(parsed);
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : "Failed to load KPIs");
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [sheetLive]);

  const items: Kpi[] = useMemo(() => {
    if (!sheetLive && breezyKpis) return breezyKpis;
    if (data === undefined) return [];
    if (!data.ok) {
      return sheetSnapshotToKpis(
        {
          openPosts: 0,
          totalApplicants: 0,
          zeroApplicantPosts: 0,
          breezyLinkedPercent: null,
          breezyLinkedCount: 0,
          columnHints: "",
        },
        data.error ?? loadError ?? undefined,
      );
    }
    return sheetSnapshotToKpis(computeSheetKpiSnapshot(data.rows, data.headers));
  }, [sheetLive, breezyKpis, data, loadError]);

  if (!sheetLive && breezyKpis === null && items.length === 0) {
    return <KpiSkeletonGrid />;
  }
  if (sheetLive && data === undefined) {
    return <KpiSkeletonGrid />;
  }

  return <KpiCards items={items} />;
}
