"use client";

import type { SheetDataResult } from "@/lib/google-sheet-csv";
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
  const [data, setData] = useState<SheetDataResult | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/recruiting-sheet", { cache: "no-store" });
        const parsed = (await res.json()) as SheetDataResult;
        if (!cancelled) setData(parsed);
      } catch (e) {
        if (!cancelled) {
          setData({
            ok: false,
            error: e instanceof Error ? e.message : "Network error while loading the sheet.",
            fetchedAt: new Date().toISOString(),
            csvUrl: "",
          });
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const items: Kpi[] = useMemo(() => {
    if (data === undefined) {
      return [];
    }
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
        data.error,
      );
    }
    const snapshot = computeSheetKpiSnapshot(data.rows, data.headers);
    return sheetSnapshotToKpis(snapshot);
  }, [data]);

  if (data === undefined) {
    return <KpiSkeletonGrid />;
  }

  return <KpiCards items={items} />;
}
