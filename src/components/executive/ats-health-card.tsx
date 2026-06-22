"use client";

import { useState } from "react";
import type { AtsHealthSeverity } from "@/lib/reliability/ats-health";
import { useAtsHealth } from "@/hooks/use-ats-health";
import { EXECUTIVE_PANEL_LOADING_CEILING_MS, useLoadingCeiling } from "@/hooks/use-loading-ceiling";

const SEVERITY_STYLES: Record<AtsHealthSeverity, string> = {
  healthy: "border-teal-500/35 bg-teal-500/10 text-teal-100",
  warning: "border-amber-500/35 bg-amber-500/10 text-amber-100",
  degraded: "border-orange-500/35 bg-orange-500/10 text-orange-100",
  offline: "border-red-500/35 bg-red-500/10 text-red-100",
};

function formatSyncTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(
      Math.round((new Date(iso).getTime() - Date.now()) / 60_000),
      "minute",
    );
  } catch {
    return new Date(iso).toLocaleString();
  }
}

function Metric({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-zinc-50">{value}</p>
      {hint ? <p className="mt-1 text-xs text-zinc-500">{hint}</p> : null}
    </div>
  );
}

export function AtsHealthCard({
  compact = false,
  collapsible = false,
}: {
  compact?: boolean;
  collapsible?: boolean;
}) {
  const { snapshot, error, loading, refreshing, refresh } = useAtsHealth();
  const [expanded, setExpanded] = useState(false);
  const loadingCeilingHit = useLoadingCeiling(loading && !snapshot, EXECUTIVE_PANEL_LOADING_CEILING_MS);
  const showLoading = loading && !snapshot && !loadingCeilingHit;

  if (showLoading) {
    return (
      <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
        <p className="text-sm text-zinc-500">Checking ATS sync…</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="h-16 animate-pulse rounded-xl bg-zinc-800/80" />
          ))}
        </div>
      </section>
    );
  }

  if (!snapshot) {
    return (
      <section className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 sm:p-5">
        <h2 className="text-lg font-semibold text-zinc-50">ATS health</h2>
        <p className="mt-2 text-sm text-amber-100">
          {error ?? (loadingCeilingHit ? "ATS status is taking longer than expected." : "ATS health unavailable")}
        </p>
        <button
          type="button"
          onClick={() => void refresh()}
          className="mt-2 rounded border border-amber-500/40 px-2 py-1 text-xs text-amber-100"
        >
          Retry
        </button>
      </section>
    );
  }

  const style = SEVERITY_STYLES[snapshot.severity];
  const isCollapsed = collapsible && !expanded;

  return (
    <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-50">ATS health</h2>
          <p className="mt-1 text-sm text-zinc-500">
            {isCollapsed ? "Sync cache summary" : "Breezy sync reliability and cache status"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {collapsible ? (
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
            >
              {expanded ? "Hide details" : "Show details"}
            </button>
          ) : null}
          {!isCollapsed ? (
            <button
              type="button"
              disabled={refreshing}
              onClick={() => void refresh()}
              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
            >
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
          ) : null}
        </div>
      </div>

      {!isCollapsed ? (
        <div className={`mt-4 rounded-xl border px-4 py-3 ${style}`}>
          <p className="text-sm font-semibold">{snapshot.statusLabel}</p>
          {!compact && snapshot.lastFailureMessage && snapshot.severity !== "healthy" ? (
            <p className="mt-1 text-xs opacity-90">{snapshot.lastFailureMessage}</p>
          ) : null}
        </div>
      ) : (
        <p className={`mt-3 inline-flex rounded-full border px-3 py-1 text-xs font-medium ${style}`}>
          {snapshot.statusLabel}
        </p>
      )}

      <div className={`mt-4 grid gap-3 sm:grid-cols-3`}>
        <Metric label="Jobs cached" value={snapshot.jobsCached.toLocaleString()} />
        <Metric label="Candidates cached" value={snapshot.candidatesCached.toLocaleString()} />
        <Metric label="Last sync" value={formatSyncTime(snapshot.lastSuccessfulSync)} />
      </div>

      {!isCollapsed ? (
        <div className={`mt-4 grid gap-3 ${compact ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3"}`}>
          {!compact ? (
            <>
              <Metric
                label="Sync duration"
                value={snapshot.syncDurationMs !== null ? `${snapshot.syncDurationMs}ms` : "—"}
              />
              <Metric label="Data freshness" value={snapshot.dataFreshnessLabel} />
              <Metric
                label="Consecutive failures"
                value={snapshot.consecutiveFailures}
                hint={snapshot.lastFailedSync ? `Last fail ${formatSyncTime(snapshot.lastFailedSync)}` : undefined}
              />
            </>
          ) : null}
        </div>
      ) : null}

      {!isCollapsed && snapshot.dataFreshness === "stale" ? (
        <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          Showing stale cached data while background refresh retries.
        </p>
      ) : null}
    </section>
  );
}
