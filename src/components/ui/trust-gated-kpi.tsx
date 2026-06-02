"use client";

import type { ReactNode } from "react";
import type { KpiTrustPresentation } from "@/lib/kpi-trust-gating";
import { KPI_PRELIMINARY_ALERT_LABEL } from "@/lib/kpi-trust-gating";

type TrustGatedKpiShellProps = {
  presentation: KpiTrustPresentation;
  className?: string;
  children: ReactNode;
};

export function KpiTrustFootnotes({ presentation }: { presentation: KpiTrustPresentation }) {
  if (!presentation.dim) return null;
  return (
    <div className="mt-1.5 space-y-0.5">
      {presentation.disclaimer ? (
        <p className="text-[10px] font-medium text-amber-200/90">{presentation.disclaimer}</p>
      ) : null}
      {presentation.scanLabel ? (
        <p className="text-[10px] text-zinc-500">{presentation.scanLabel}</p>
      ) : null}
      {presentation.preliminaryAlert ? (
        <p className="text-[10px] italic text-zinc-500">{KPI_PRELIMINARY_ALERT_LABEL} — not final</p>
      ) : null}
    </div>
  );
}

export function TrustGatedKpiShell({
  presentation,
  className = "",
  children,
}: TrustGatedKpiShellProps) {
  const dimClass = presentation.dim ? "opacity-55 saturate-[0.85]" : "";
  return (
    <div
      className={`${className} ${dimClass}`.trim()}
      aria-busy={presentation.dim ? true : undefined}
      data-kpi-trust-gated={presentation.dim ? "true" : undefined}
    >
      {children}
      <KpiTrustFootnotes presentation={presentation} />
    </div>
  );
}
