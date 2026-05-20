"use client";

import { DmCoverageRiskAlerts } from "@/components/dm/dm-coverage-risk-alerts";
import { CoverageRiskExecutivePanel } from "@/components/recruiting/coverage-risk-executive-panel";
import { useCoverageRisk } from "@/hooks/use-coverage-risk";
import { TabSkeleton } from "@/components/ui/tab-skeleton";

type CoverageRiskSectionProps = {
  variant: "executive" | "dm";
};

export function CoverageRiskSection({ variant }: CoverageRiskSectionProps) {
  const { snapshot, loading, error, timedOut, refresh } = useCoverageRisk();

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-zinc-500">
          Coverage risk engine · live MEL + workforce roster
          {loading ? <span className="ml-2 text-teal-400/90">Loading…</span> : null}
        </p>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800 disabled:opacity-60"
        >
          Refresh risk data
        </button>
      </div>

      {error ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100"
        >
          <p>{error}</p>
          {(timedOut || error) && (
            <button
              type="button"
              onClick={() => void refresh()}
              className="shrink-0 rounded-lg border border-red-400/40 px-3 py-1 text-xs font-medium text-red-100 hover:bg-red-500/20"
            >
              Retry
            </button>
          )}
        </div>
      ) : null}

      {loading && !snapshot ? <TabSkeleton rows={3} cards={4} /> : null}

      {snapshot && variant === "executive" ? <CoverageRiskExecutivePanel snapshot={snapshot} /> : null}
      {snapshot && variant === "dm" ? <DmCoverageRiskAlerts snapshot={snapshot} /> : null}
    </section>
  );
}
