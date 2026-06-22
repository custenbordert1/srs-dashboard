"use client";

import Link from "next/link";
import { EXECUTIVE_PANEL_LOADING_CEILING_MS, useLoadingCeiling } from "@/hooks/use-loading-ceiling";

type ExecutiveAccountabilitySummaryProps = {
  openActions: number;
  overdueActions: number;
  headline?: string | null;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
};

export function ExecutiveAccountabilitySummary({
  openActions,
  overdueActions,
  headline,
  loading,
  error,
  onRetry,
}: ExecutiveAccountabilitySummaryProps) {
  const loadingCeilingHit = useLoadingCeiling(Boolean(loading), EXECUTIVE_PANEL_LOADING_CEILING_MS);
  const showLoading = loading && !loadingCeilingHit;

  return (
    <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-50">Accountability</h2>
          <p className="mt-1 text-sm text-zinc-500">Executive operating rhythm and tracked actions.</p>
        </div>
        <Link
          href="/?tab=executive-accountability"
          className="rounded-lg border border-teal-500/40 bg-teal-500/10 px-3 py-1.5 text-xs text-teal-100"
        >
          Open board
        </Link>
      </div>

      {showLoading ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="h-16 animate-pulse rounded-xl bg-zinc-800/80" />
          <div className="h-16 animate-pulse rounded-xl bg-zinc-800/80" />
        </div>
      ) : error && loadingCeilingHit ? (
        <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
          <p>{error}</p>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="mt-2 rounded border border-amber-400/40 px-2 py-0.5 text-xs"
            >
              Retry
            </button>
          ) : null}
        </div>
      ) : (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Open actions</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-50">{openActions}</p>
            </div>
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-red-200/80">Overdue</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-red-100">{overdueActions}</p>
            </div>
          </div>
          {headline ? (
            <p className="mt-4 rounded-lg border border-zinc-800/80 bg-zinc-950/40 px-3 py-2 text-sm text-zinc-300">
              {headline}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
