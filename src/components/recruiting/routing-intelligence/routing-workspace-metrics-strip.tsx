"use client";

import type { RouteWorkspaceMetrics } from "@/lib/routing-intelligence/routing-workspace";

type RoutingWorkspaceMetricsStripProps = {
  metrics: RouteWorkspaceMetrics;
};

const METRIC_ITEMS: { key: keyof RouteWorkspaceMetrics; label: string; suffix?: string }[] = [
  { key: "totalEstimatedRouteMiles", label: "Total est. miles" },
  { key: "avgDriveBurden", label: "Avg drive burden" },
  { key: "overnightPercent", label: "Overnight", suffix: "%" },
  { key: "multiDayPercent", label: "Multi-day", suffix: "%" },
  { key: "routeEfficiencyScore", label: "Route efficiency" },
  { key: "coverageSaturation", label: "Coverage saturation", suffix: "%" },
  { key: "avgStoresPerRoutePack", label: "Stores / pack" },
  { key: "avgOpenJobsPerRoutePack", label: "Open jobs / pack" },
];

export function RoutingWorkspaceMetricsStrip({ metrics }: RoutingWorkspaceMetricsStripProps) {
  return (
    <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/50 p-4">
      <header className="mb-3">
        <h3 className="text-sm font-semibold text-zinc-50">Route metrics</h3>
        <p className="text-[11px] text-zinc-500">
          Territory-wide planning aggregates across {metrics.routePackCount} route pack
          {metrics.routePackCount === 1 ? "" : "s"}.
        </p>
      </header>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        {METRIC_ITEMS.map(({ key, label, suffix }) => (
          <div
            key={key}
            className="rounded-xl border border-zinc-800 bg-zinc-950/80 px-2.5 py-2 text-center"
          >
            <p className="text-lg font-semibold tabular-nums text-zinc-100">
              {metrics[key]}
              {suffix ?? ""}
            </p>
            <p className="mt-0.5 text-[9px] uppercase tracking-wide text-zinc-500">{label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
