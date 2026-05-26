"use client";

import type { RecruiterOperationalKpi } from "@/lib/recruiting-dashboard-ux/recruiter-operational-kpis";

const TONE_STYLES: Record<NonNullable<RecruiterOperationalKpi["tone"]>, string> = {
  neutral: "border-zinc-800 bg-zinc-950/50",
  good: "border-emerald-500/25 bg-emerald-500/5",
  warn: "border-amber-500/25 bg-amber-500/5",
  critical: "border-red-500/25 bg-red-500/5",
};

export function RecruiterOperationalKpiStrip({ kpis }: { kpis: RecruiterOperationalKpi[] }) {
  return (
    <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {kpis.map((kpi) => (
        <div
          key={kpi.id}
          className={`rounded-xl border px-3 py-2.5 ${TONE_STYLES[kpi.tone ?? "neutral"]}`}
        >
          <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">{kpi.label}</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-zinc-100">{kpi.value}</p>
          {kpi.hint ? <p className="mt-0.5 text-[11px] text-zinc-500">{kpi.hint}</p> : null}
        </div>
      ))}
    </section>
  );
}
