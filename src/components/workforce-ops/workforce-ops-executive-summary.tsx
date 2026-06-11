"use client";

import { fetchWithTimeout, DASHBOARD_REQUEST_TIMEOUT_MS } from "@/lib/fetch-with-timeout";
import type { WorkforceOpsCenterSnapshot } from "@/lib/workforce-ops-center";
import { useEffect, useState } from "react";

type WorkforceOpsResponse = {
  ok?: boolean;
  center?: WorkforceOpsCenterSnapshot;
  error?: string;
};

export function WorkforceOpsExecutiveSummary() {
  const [center, setCenter] = useState<WorkforceOpsCenterSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchWithTimeout("/api/workforce-ops", {
          timeoutMs: DASHBOARD_REQUEST_TIMEOUT_MS,
        });
        const parsed = (await res.json()) as WorkforceOpsResponse;
        if (cancelled) return;
        if (parsed.ok && parsed.center) setCenter(parsed.center);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4">
        <p className="text-sm text-zinc-500">Loading workforce operations rollup…</p>
      </section>
    );
  }

  if (!center) return null;

  const rollup = center.executiveRollup;
  const health = center.workforceHealth;

  return (
    <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
      <h3 className="text-base font-semibold text-zinc-50">Workforce & MEL integration</h3>
      <p className="mt-1 text-xs text-zinc-500">
        Recruiting → MEL conversion, fill rates, and workforce capacity
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { label: "Recruiting → MEL", value: `${rollup.recruitingToMelConversionPercent}%` },
          {
            label: "Time to fill",
            value: rollup.avgTimeToFillDays !== null ? `${rollup.avgTimeToFillDays}d` : "—",
          },
          { label: "Capacity score", value: `${rollup.workforceCapacityScore}/100` },
          { label: "Open calls", value: String(health.openCalls) },
          { label: "Pipeline ready", value: String(center.melPipeline.filter((r) => r.melReady).length) },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-lg border border-zinc-800/80 bg-zinc-950/50 px-3 py-2"
          >
            <p className="text-[10px] uppercase tracking-wide text-zinc-500">{kpi.label}</p>
            <p className="mt-0.5 text-sm font-semibold text-zinc-100">{kpi.value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
