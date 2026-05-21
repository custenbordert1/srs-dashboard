"use client";

import type { BreezyCandidatesResult } from "@/lib/breezy-api";
import { buildBreezyCandidateSummary } from "@/lib/breezy-candidate-summary";
import { fetchCachedBreezyCandidates } from "@/lib/cached-breezy-client";
import { DashboardSectionFallback } from "@/components/ui/dashboard-section-fallback";
import { useLoadingCeiling } from "@/hooks/use-loading-ceiling";
import { useCallback, useEffect, useMemo, useState } from "react";
import { KpiCards } from "./kpi-cards";

function NewestCandidatesTable({
  rows,
}: {
  rows: ReturnType<typeof buildBreezyCandidateSummary>["newestCandidates"];
}) {
  return (
    <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 shadow-sm shadow-black/20 backdrop-blur-sm">
      <div className="border-b border-zinc-800/80 px-4 py-4 sm:px-5">
        <h3 className="text-lg font-semibold tracking-tight text-zinc-50">Newest candidates</h3>
        <p className="mt-1 text-sm text-zinc-500">Ten most recent applicants from the live Breezy pull.</p>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-8 text-sm text-zinc-500 sm:px-5">No candidates in the current sync.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-[880px] w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800/80 text-xs uppercase tracking-wider text-zinc-500">
                <th className="px-4 py-3 font-medium sm:px-5">Name</th>
                <th className="px-4 py-3 font-medium sm:px-5">Source</th>
                <th className="px-4 py-3 font-medium sm:px-5">Stage</th>
                <th className="px-4 py-3 font-medium sm:px-5">Position</th>
                <th className="px-4 py-3 font-medium sm:px-5">City/State</th>
                <th className="px-4 py-3 font-medium sm:px-5">Applied date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {rows.map((row) => (
                <tr key={row.candidateId} className="hover:bg-zinc-800/30">
                  <td className="px-4 py-3 font-medium text-zinc-100 sm:px-5">{row.name}</td>
                  <td className="px-4 py-3 text-zinc-300 sm:px-5">{row.source}</td>
                  <td className="px-4 py-3 text-zinc-300 sm:px-5">{row.stage}</td>
                  <td className="px-4 py-3 text-zinc-300 sm:px-5">{row.position}</td>
                  <td className="px-4 py-3 text-zinc-400 sm:px-5">{row.location}</td>
                  <td className="px-4 py-3 text-zinc-400 sm:px-5">{row.appliedDateLabel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function BreezyDashboardSummary() {
  const [data, setData] = useState<BreezyCandidatesResult | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const loadingCeilingHit = useLoadingCeiling(loading);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const parsed = await fetchCachedBreezyCandidates();
      setData(parsed);
    } catch (err) {
      setData({
        ok: false,
        error: err instanceof Error ? err.message : "Failed to load Breezy candidates",
        fetchedAt: new Date().toISOString(),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(id);
  }, [load]);

  const retry = useCallback(() => {
    setRetrying(true);
    void load().finally(() => setRetrying(false));
  }, [load]);

  const summary = useMemo(() => {
    if (!data?.ok) return null;
    return buildBreezyCandidateSummary(data);
  }, [data]);

  if (loading || data === undefined) {
    return (
      <DashboardSectionFallback
        title="Breezy recruiting summary"
        loadingMessage="Loading Breezy candidate summary…"
        isLoading
        loadingCeilingHit={loadingCeilingHit}
        onRetry={retry}
        retrying={retrying}
        skeletonRows={2}
        skeletonCards={4}
      />
    );
  }

  if (!data.ok) {
    return (
      <DashboardSectionFallback
        title="Breezy recruiting summary"
        error={data.error}
        timedOut={data.error.toLowerCase().includes("timed out")}
        onRetry={retry}
        retrying={retrying}
      />
    );
  }

  if (!summary) {
    return (
      <DashboardSectionFallback
        title="Breezy recruiting summary"
        isEmpty
        emptyMessage="No candidates returned from the latest Breezy sync."
        onRetry={retry}
        retrying={retrying}
      />
    );
  }

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-zinc-50">Breezy recruiting summary</h2>
        <p className="mt-1 max-w-3xl text-sm text-zinc-500">
          Live candidate metrics from the Breezy API. Counts are computed directly from the synced candidate
          array ({summary.totalCandidates.toLocaleString()} records).
        </p>
        {summary.partialPositionSync ? (
          <p
            role="status"
            className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100"
          >
            Partial Breezy sync — more positions/candidates available.
          </p>
        ) : null}
      </div>

      <KpiCards items={summary.kpis} gridClassName="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" />

      <NewestCandidatesTable rows={summary.newestCandidates} />
    </section>
  );
}
