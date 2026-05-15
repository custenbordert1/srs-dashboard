"use client";

import type { SheetDataResult } from "@/lib/google-sheet-csv";
import type { Kpi } from "@/lib/recruiting-sample-data";
import {
  computeManagerKpiSnapshot,
  managerKpiSnapshotToKpis,
} from "@/lib/manager-sheet-stats";
import { useEffect, useMemo, useState } from "react";
import { KpiCards } from "./kpi-cards";

function ManagerKpiSkeletonGrid() {
  return (
    <section
      aria-labelledby="manager-kpi-heading"
      aria-busy="true"
      className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
    >
      <h2 id="manager-kpi-heading" className="sr-only">
        Manager key performance indicators
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

type ManagerKpiCardsProps = {
  selectedManager?: string | null;
};

export function ManagerKpiCards({ selectedManager = null }: ManagerKpiCardsProps) {
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

  const { items, scopeLabel } = useMemo(() => {
    const fallbackScope = selectedManager?.trim() || "All managers";
    if (data === undefined) {
      return { items: [] as Kpi[], scopeLabel: fallbackScope };
    }
    if (!data.ok) {
      return {
        items: managerKpiSnapshotToKpis(
          {
            openPosts: 0,
            criticalPosts: 0,
            avgApplicants: null,
            zeroApplicantPercent: null,
            scopeLabel: fallbackScope,
            columnHint: "",
          },
          data.error,
        ),
        scopeLabel: fallbackScope,
      };
    }
    const snapshot = computeManagerKpiSnapshot(data.rows, data.headers, selectedManager);
    return {
      items: managerKpiSnapshotToKpis(snapshot),
      scopeLabel: snapshot.scopeLabel,
    };
  }, [data, selectedManager]);

  if (data === undefined) {
    return <ManagerKpiSkeletonGrid />;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-sm font-medium text-zinc-400">
          {selectedManager?.trim() ? "Manager KPIs" : "Overall KPIs"}
        </h2>
        <p className="text-xs text-zinc-500">
          Scope: <span className="font-medium text-zinc-300">{scopeLabel}</span>
        </p>
      </div>
      <KpiCards items={items} />
    </div>
  );
}
