"use client";

import { fetchWithTimeout, DASHBOARD_REQUEST_TIMEOUT_MS } from "@/lib/fetch-with-timeout";
import type { CoverageOptimizationSnapshot } from "@/lib/coverage-optimization";
import { useEffect, useState } from "react";

export function CoverageOptimizationExecutiveSummary() {
  const [snapshot, setSnapshot] = useState<CoverageOptimizationSnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchWithTimeout("/api/coverage-optimization", {
          timeoutMs: DASHBOARD_REQUEST_TIMEOUT_MS,
        });
        const parsed = (await res.json()) as { ok?: boolean; snapshot?: CoverageOptimizationSnapshot };
        if (!cancelled && parsed.ok && parsed.snapshot) setSnapshot(parsed.snapshot);
      } catch {
        // optional panel
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!snapshot) return null;

  const exec = snapshot.executive;

  return (
    <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
      <h3 className="text-base font-semibold text-zinc-50">Coverage optimization</h3>
      <p className="mt-1 text-xs text-zinc-500">Route builder savings and fill probability rollup</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Optimization savings", value: `$${exec.optimizationSavingsUsd}` },
          { label: "Avg fill probability", value: `${exec.averageFillProbability}%` },
          { label: "No viable reps", value: String(exec.territoriesWithNoViableReps.length) },
          {
            label: "Highest-cost territory",
            value: exec.highestCostTerritories[0]?.territory ?? "—",
          },
        ].map((kpi) => (
          <div key={kpi.label} className="rounded-lg border border-zinc-800/80 bg-zinc-950/50 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-zinc-500">{kpi.label}</p>
            <p className="mt-0.5 text-sm font-semibold text-zinc-100">{kpi.value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
