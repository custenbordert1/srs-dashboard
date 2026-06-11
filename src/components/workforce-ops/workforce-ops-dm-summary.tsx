"use client";

import { fetchWithTimeout, DASHBOARD_REQUEST_TIMEOUT_MS } from "@/lib/fetch-with-timeout";
import type { WorkforceOpsCenterSnapshot } from "@/lib/workforce-ops-center";
import { useEffect, useState } from "react";

type WorkforceOpsResponse = {
  ok?: boolean;
  center?: WorkforceOpsCenterSnapshot;
};

export function WorkforceOpsDmSummary() {
  const [center, setCenter] = useState<WorkforceOpsCenterSnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchWithTimeout("/api/workforce-ops", {
          timeoutMs: DASHBOARD_REQUEST_TIMEOUT_MS,
        });
        const parsed = (await res.json()) as WorkforceOpsResponse;
        if (!cancelled && parsed.ok && parsed.center) setCenter(parsed.center);
      } catch {
        // optional summary — fail silently
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!center) return null;

  const health = center.workforceHealth;
  const queueCount = center.operationsQueue.length;

  return (
    <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
      <h3 className="text-base font-semibold text-zinc-50">Workforce operations</h3>
      <p className="mt-1 text-xs text-zinc-500">MEL opportunities, coverage, and operations queue</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-4">
        <Kpi label="Open calls" value={String(health.openCalls)} />
        <Kpi label="Coverage" value={`${health.coveragePercent}%`} />
        <Kpi label="Active reps" value={String(health.activeReps)} />
        <Kpi label="Ops queue" value={String(queueCount)} />
      </div>
    </section>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-800/80 bg-zinc-950/50 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-zinc-100">{value}</p>
    </div>
  );
}
